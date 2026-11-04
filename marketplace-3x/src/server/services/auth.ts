import { z } from "zod";
import type { Role } from "@prisma/client";
import { db } from "../db";
import { AppError } from "../errors";
import { hashPassword, passwordProblem, randomToken, sha256, verifyPassword } from "../auth/password";
import { queueEmail } from "../email/mailer";
import { audit } from "../audit";
import { brand } from "@/config/brand";
import type { Actor } from "../auth/actor";

export const registerSchema = z.object({
  role: z.enum(["INDIVIDUAL", "PROFESSIONAL", "SUPPLIER"]),
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide"),
  password: z.string(),
  displayName: z.string().trim().min(2, "Nom trop court").max(80),
  city: z.string().trim().max(80).optional(),
  postalCode: z.string().trim().max(10).optional(),
  companyName: z.string().trim().max(120).optional(),
  siret: z.string().trim().max(20).optional(),
  referralCode: z.string().trim().max(20).optional(),
  acceptTerms: z.literal(true, { message: "Vous devez accepter les CGU" }),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export function makeCode(prefix: string, len = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return `${prefix}${s}`;
}

export async function registerUser(raw: unknown) {
  const input = registerSchema.parse(raw);
  const pwProblem = passwordProblem(input.password);
  if (pwProblem) throw new AppError(pwProblem);
  if (input.role === "SUPPLIER" && !input.companyName) throw new AppError("La raison sociale est obligatoire");
  const existing = await db.user.findUnique({ where: { email: input.email } });
  if (existing) throw new AppError("Un compte existe déjà avec cette adresse e-mail");

  const referrer = input.referralCode
    ? await db.user.findUnique({ where: { referralCode: input.referralCode.toUpperCase() } })
    : null;

  const passwordHash = await hashPassword(input.password);
  const user = await db.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        email: input.email, passwordHash, displayName: input.displayName, primaryRole: input.role,
        city: input.city || null, postalCode: input.postalCode || null,
        referralCode: makeCode("P"), referredById: referrer?.id,
        roles: { create: [{ role: input.role }] },
      },
    });
    // Tout compte peut acheter : les profils pro / fournisseur reçoivent aussi le rôle INDIVIDUAL côté achat.
    if (input.role !== "INDIVIDUAL") await tx.userRole.create({ data: { userId: u.id, role: "INDIVIDUAL" } });
    if (input.role === "INDIVIDUAL") await tx.individualProfile.create({ data: { userId: u.id } });
    if (input.role === "PROFESSIONAL") {
      await tx.individualProfile.create({ data: { userId: u.id } });
      await tx.professionalProfile.create({
        data: { userId: u.id, refCode: makeCode("COM"), siret: input.siret || null, serviceArea: input.city, verificationStatus: "UNVERIFIED" },
      });
    }
    if (input.role === "SUPPLIER") {
      await tx.individualProfile.create({ data: { userId: u.id } });
      await tx.supplierProfile.create({ data: { userId: u.id, companyName: input.companyName!, siret: input.siret || null } });
    }
    await audit(u.id, "user.register", "User", u.id, { role: input.role, referred: !!referrer }, tx);
    return u;
  });
  await sendVerificationEmail(user.id);
  return user;
}

export async function sendVerificationEmail(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const token = randomToken();
  await db.emailVerificationToken.create({
    data: { userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 48 * 3600e3) },
  });
  await queueEmail(user.email, `${brand.name} — confirmez votre adresse e-mail`,
    `Bonjour ${user.displayName},\n\nConfirmez votre adresse : ${process.env.APP_URL ?? ""}/verifier-email?token=${token}\n\nCe lien expire dans 48 heures.`);
  return token;
}

export async function verifyEmail(token: string) {
  const row = await db.emailVerificationToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) throw new AppError("Lien invalide ou expiré");
  await db.$transaction([
    db.emailVerificationToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    db.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } }),
  ]);
  return row.userId;
}

// Limitation simple des tentatives (mémoire du processus). En production multi-instances : Redis / Upstash.
const attempts = new Map<string, { n: number; until: number }>();
export function checkRateLimit(key: string, max = 8, windowMs = 15 * 60e3) {
  const now = Date.now();
  const a = attempts.get(key);
  if (a && a.until > now && a.n >= max) throw new AppError("Trop de tentatives, réessayez dans quelques minutes.");
  if (!a || a.until < now) attempts.set(key, { n: 1, until: now + windowMs });
  else a.n++;
}

export async function authenticate(emailRaw: string, password: string) {
  const email = emailRaw.trim().toLowerCase();
  checkRateLimit(`login:${email}`);
  const user = await db.user.findUnique({ where: { email } });
  // Comparaison effectuée même si l'utilisateur n'existe pas (temps constant approximatif).
  const ok = await verifyPassword(password, user?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva");
  if (!user || !ok) throw new AppError("Identifiants incorrects");
  if (user.status === "SUSPENDED") throw new AppError("Ce compte est suspendu. Contactez le support.");
  if (user.status === "DELETED") throw new AppError("Identifiants incorrects");
  attempts.delete(`login:${email}`);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return user;
}

export async function requestPasswordReset(emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  checkRateLimit(`reset:${email}`, 5);
  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.status !== "ACTIVE") return; // réponse identique : pas d'énumération des comptes
  const token = randomToken();
  await db.passwordResetToken.create({
    data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3600e3) },
  });
  await queueEmail(user.email, `${brand.name} — réinitialisation du mot de passe`,
    `Bonjour,\n\nPour choisir un nouveau mot de passe : ${process.env.APP_URL ?? ""}/reinitialiser?token=${token}\n\nCe lien expire dans 1 heure. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.`);
  return token;
}

export async function resetPassword(token: string, password: string) {
  const problem = passwordProblem(password);
  if (problem) throw new AppError(problem);
  const row = await db.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) throw new AppError("Lien invalide ou expiré");
  const passwordHash = await hashPassword(password);
  await db.$transaction([
    db.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    db.user.update({ where: { id: row.userId }, data: { passwordHash } }),
    db.session.deleteMany({ where: { userId: row.userId } }), // déconnexion de toutes les sessions
  ]);
  await audit(row.userId, "user.password_reset", "User", row.userId);
}

export async function loadActor(userId: string): Promise<Actor | null> {
  const u = await db.user.findUnique({ where: { id: userId }, include: { roles: true } });
  if (!u || u.status === "DELETED") return null;
  return {
    id: u.id, email: u.email, displayName: u.displayName, primaryRole: u.primaryRole,
    roles: u.roles.map((r) => r.role as Role), status: u.status, emailVerified: !!u.emailVerifiedAt,
  };
}
