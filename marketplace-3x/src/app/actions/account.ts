"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { safeAction, str, files, bool } from "@/lib/actions";
import { requireActor, destroySession } from "@/server/auth/session";
import { sendMessage } from "@/server/services/messaging";
import { markAllRead } from "@/server/services/notifications";
import { storeImage } from "@/server/storage";
import { db } from "@/server/db";
import { deleteAccount } from "@/server/services/admin";
import { startPayoutOnboarding, refreshPayoutAccount } from "@/server/services/finance";
import { hashPassword, passwordProblem, verifyPassword } from "@/server/auth/password";
import { AppError } from "@/server/errors";
import { audit } from "@/server/audit";

export const sendMessageAction = safeAction(async (fd) => {
  const a = await requireActor();
  const f = files(fd, "attachment")[0];
  const url = f ? await storeImage(f, `m-${a.id.slice(-6)}`) : null;
  await sendMessage(a, str(fd, "conversationId"), str(fd, "body"), url);
  revalidatePath(`/messages/${str(fd, "conversationId")}`);
  return { ok: "Envoyé" };
});

export async function markAllReadAction() {
  const a = await requireActor();
  await markAllRead(a.id);
  revalidatePath("/notifications");
}

export const profileAction = safeAction(async (fd) => {
  const a = await requireActor();
  const displayName = str(fd, "displayName");
  if (displayName.length < 2) throw new AppError("Nom trop court");
  await db.user.update({ where: { id: a.id }, data: { displayName: displayName.slice(0, 80), city: str(fd, "city") || null, postalCode: str(fd, "postalCode") || null } });
  revalidatePath("/compte");
  return { ok: "Profil mis à jour" };
});

export const passwordAction = safeAction(async (fd) => {
  const a = await requireActor();
  const u = await db.user.findUniqueOrThrow({ where: { id: a.id } });
  if (!(await verifyPassword(str(fd, "current"), u.passwordHash))) throw new AppError("Mot de passe actuel incorrect");
  const pb = passwordProblem(str(fd, "password"));
  if (pb) throw new AppError(pb);
  await db.user.update({ where: { id: a.id }, data: { passwordHash: await hashPassword(str(fd, "password")) } });
  await db.session.deleteMany({ where: { userId: a.id } });
  await audit(a.id, "user.password_change", "User", a.id);
  redirect("/connexion?ok=mdp");
});

export const deleteAccountAction = safeAction(async (fd) => {
  const a = await requireActor();
  if (str(fd, "confirm") !== "SUPPRIMER") throw new AppError("Tapez SUPPRIMER pour confirmer");
  await deleteAccount(a);
  await destroySession();
  redirect("/");
});

export const payoutOnboardingAction = safeAction(async () => {
  const a = await requireActor();
  const url = await startPayoutOnboarding(a, process.env.APP_URL ?? "http://localhost:3000");
  if (url.includes("demo_onboarding")) await refreshPayoutAccount(a.id);
  redirect(url);
});

export const proProfileAction = safeAction(async (fd) => {
  const a = await requireActor();
  const pct = Number(str(fd, "defaultCommission").replace(",", "."));
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new AppError("Commission invalide");
  const askVerification = bool(fd, "requestVerification");
  const prof = await db.professionalProfile.findUniqueOrThrow({ where: { userId: a.id } });
  await db.professionalProfile.update({
    where: { userId: a.id },
    data: {
      headline: str(fd, "headline").slice(0, 140) || null, bio: str(fd, "bio").slice(0, 3000) || null, serviceArea: str(fd, "serviceArea") || null,
      serviceRadiusKm: Number(str(fd, "serviceRadiusKm") || 30), specialties: str(fd, "specialties").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10),
      categorySlugs: fd.getAll("categorySlugs").map(String), defaultCommissionBps: Math.round(pct * 100), offersPickup: bool(fd, "offersPickup"),
      siret: str(fd, "siret") || null,
      ...(askVerification && (prof.verificationStatus === "UNVERIFIED" || prof.verificationStatus === "REJECTED") ? { verificationStatus: "PENDING" } : {}),
    },
  });
  revalidatePath("/pro/profil");
  return { ok: askVerification ? "Profil enregistré et demande de vérification envoyée" : "Profil enregistré" };
});

export const supplierProfileAction = safeAction(async (fd) => {
  const a = await requireActor();
  const prof = await db.supplierProfile.findUniqueOrThrow({ where: { userId: a.id } });
  const ask = bool(fd, "requestVerification");
  await db.supplierProfile.update({
    where: { userId: a.id },
    data: {
      companyName: str(fd, "companyName") || prof.companyName, legalForm: str(fd, "legalForm") || null, siret: str(fd, "siret") || null,
      vatNumber: str(fd, "vatNumber") || null, website: str(fd, "website") || null, description: str(fd, "description").slice(0, 3000) || null,
      defaultShippingDays: Number(str(fd, "defaultShippingDays") || 3),
      ...(ask && (prof.verificationStatus === "UNVERIFIED" || prof.verificationStatus === "REJECTED") ? { verificationStatus: "PENDING" } : {}),
    },
  });
  revalidatePath("/fournisseur/profil");
  return { ok: ask ? "Profil enregistré et demande de vérification envoyée" : "Profil enregistré" };
});
