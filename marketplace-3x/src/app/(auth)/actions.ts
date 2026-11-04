"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { safeAction, str, bool } from "@/lib/actions";
import { authenticate, registerUser, requestPasswordReset, resetPassword, sendVerificationEmail } from "@/server/services/auth";
import { createSession, destroySession, getActor } from "@/server/auth/session";
import { spaces } from "@/config/brand";
import { audit } from "@/server/audit";

function safeNext(n: string) { return n.startsWith("/") && !n.startsWith("//") ? n : ""; }

export const loginAction = safeAction(async (fd) => {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "local";
  const { checkRateLimit } = await import("@/server/services/auth");
  checkRateLimit(`login-ip:${ip}`, 30);
  const user = await authenticate(str(fd, "email"), str(fd, "password"));
  await createSession(user.id);
  await audit(user.id, "user.login", "User", user.id, { ip });
  redirect(safeNext(str(fd, "next")) || `${spaces[user.primaryRole].path}?ok=connecte`);
});

export const registerAction = safeAction(async (fd) => {
  const user = await registerUser({
    role: str(fd, "role"), email: str(fd, "email"), password: str(fd, "password"), displayName: str(fd, "displayName"),
    city: str(fd, "city") || undefined, postalCode: str(fd, "postalCode") || undefined,
    companyName: str(fd, "companyName") || undefined, siret: str(fd, "siret") || undefined,
    referralCode: str(fd, "referralCode") || undefined, acceptTerms: bool(fd, "acceptTerms") || undefined,
  });
  await createSession(user.id);
  redirect(`${user.primaryRole === "PROFESSIONAL" ? "/pro/profil" : user.primaryRole === "SUPPLIER" ? "/fournisseur/profil" : "/espace"}?ok=bienvenue`);
});

export const forgotAction = safeAction(async (fd) => {
  await requestPasswordReset(str(fd, "email"));
  return { ok: "Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d'être envoyé." };
});

export const resetAction = safeAction(async (fd) => {
  if (str(fd, "password") !== str(fd, "confirm")) return { error: "Les mots de passe ne correspondent pas" };
  await resetPassword(str(fd, "token"), str(fd, "password"));
  redirect("/connexion?ok=mdp");
});

export const resendVerificationAction = safeAction(async () => {
  const a = await getActor();
  if (!a) redirect("/connexion");
  await sendVerificationEmail(a.id);
  return { ok: "E-mail de confirmation renvoyé." };
});

export async function logoutAction() {
  await destroySession();
  redirect("/");
}
