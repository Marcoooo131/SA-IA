"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { safeAction, str, bool } from "@/lib/actions";
import { requireActor } from "@/server/auth/session";
import {
  closeDelegationRequest, createDelegationRequest, decidePriceProposal, endContract, entrustProducts, proposePrice,
  proposeToOwner, requestProfessional, respondToOffer, withdrawOffer, withdrawProduct,
} from "@/server/services/delegation";
import { parseEurosToCents } from "@/lib/money";
import { AppError } from "@/server/errors";

const pctToBps = (s: string) => {
  const n = Number(s.replace(",", ".").replace("%", "").trim());
  if (!Number.isFinite(n)) throw new AppError("Commission invalide");
  return Math.round(n * 100);
};
const terms = (fd: FormData) => ({
  commissionBps: pctToBps(str(fd, "commission")), mode: str(fd, "mode") || "SALES_ONLY",
  handlesShipping: bool(fd, "handlesShipping"), durationDays: Number(str(fd, "durationDays") || 90), message: str(fd, "message"),
});

export const requestProAction = safeAction(async (fd) => {
  const actor = await requireActor();
  await requestProfessional(actor, str(fd, "professionalId"), terms(fd));
  redirect("/espace/delegation?ok=envoye");
});

export const proposeAction = safeAction(async (fd) => {
  const actor = await requireActor();
  await proposeToOwner(actor, str(fd, "ownerId"), terms(fd), str(fd, "requestId") || null);
  revalidatePath("/pro/prospection");
  return { ok: "Proposition envoyée. Vous serez notifié de la réponse." };
});

export const respondAction = safeAction(async (fd) => {
  const actor = await requireActor();
  const contract = await respondToOffer(actor, str(fd, "offerId"), str(fd, "decision") === "accept");
  if (contract) redirect(`/collaborations/${contract.id}?ok=Collaboration%20activ%C3%A9e`);
  revalidatePath("/espace/delegation"); revalidatePath("/pro/propositions");
  return { ok: "Proposition refusée" };
});

export const withdrawOfferAction = safeAction(async (fd) => {
  const actor = await requireActor();
  await withdrawOffer(actor, str(fd, "offerId"));
  revalidatePath("/pro/propositions"); revalidatePath("/espace/delegation");
  return { ok: "Proposition retirée" };
});

export const createRequestAction = safeAction(async (fd) => {
  const actor = await requireActor();
  await createDelegationRequest(actor, {
    title: str(fd, "title"), description: str(fd, "description"), city: str(fd, "city"), postalCode: str(fd, "postalCode") || null,
    categorySlugs: fd.getAll("categorySlugs").map(String), estimatedItems: Number(str(fd, "estimatedItems") || 1),
    estimatedValueCents: str(fd, "estimatedValue") ? parseEurosToCents(str(fd, "estimatedValue")) : null,
    mode: str(fd, "mode") || "SALES_ONLY", maxCommissionBps: str(fd, "maxCommission") ? pctToBps(str(fd, "maxCommission")) : null,
  });
  revalidatePath("/espace/delegation");
  return { ok: "Demande publiée : les indépendants de votre secteur peuvent désormais vous faire des propositions." };
});

export const closeRequestAction = safeAction(async (fd) => {
  const actor = await requireActor();
  await closeDelegationRequest(actor, str(fd, "requestId"));
  revalidatePath("/espace/delegation");
  return { ok: "Demande fermée" };
});

export const entrustAction = safeAction(async (fd) => {
  const actor = await requireActor();
  const ids = fd.getAll("productIds").map(String);
  if (!ids.length) throw new AppError("Sélectionnez au moins un article");
  const minPrices: Record<string, number | null> = {};
  for (const id of ids) { const v = str(fd, `min_${id}`); minPrices[id] = v ? parseEurosToCents(v) : null; }
  await entrustProducts(actor, str(fd, "contractId"), ids, minPrices);
  revalidatePath(`/collaborations/${str(fd, "contractId")}`);
  return { ok: "Articles confiés à l'indépendant" };
});

export const withdrawProductAction = safeAction(async (fd) => {
  const actor = await requireActor();
  await withdrawProduct(actor, str(fd, "productId"));
  revalidatePath(`/collaborations/${str(fd, "contractId")}`);
  return { ok: "Article retiré de la collaboration" };
});

export const endContractAction = safeAction(async (fd) => {
  const actor = await requireActor();
  await endContract(actor, str(fd, "contractId"));
  revalidatePath(`/collaborations/${str(fd, "contractId")}`);
  return { ok: "Collaboration terminée" };
});

export const proposePriceAction = safeAction(async (fd) => {
  const actor = await requireActor();
  await proposePrice(actor, str(fd, "productId"), parseEurosToCents(str(fd, "price")), str(fd, "reason"));
  revalidatePath(`/collaborations/${str(fd, "contractId")}`);
  return { ok: "Prix proposé au propriétaire" };
});

export const decidePriceAction = safeAction(async (fd) => {
  const actor = await requireActor();
  await decidePriceProposal(actor, str(fd, "proposalId"), str(fd, "decision") === "approve");
  revalidatePath(`/collaborations/${str(fd, "contractId")}`);
  return { ok: "Décision enregistrée" };
});
