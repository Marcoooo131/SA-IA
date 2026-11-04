import { db } from "../db";
import { AppError, ForbiddenError } from "../errors";
import type { Actor } from "../auth/actor";
import { assertActive } from "../auth/permissions";
import { notify } from "./notifications";

type Context = { productId?: string; orderId?: string; offerId?: string; contractId?: string };

/** Démarre (ou reprend) une conversation entre deux utilisateurs pour un contexte donné. */
export async function startConversation(actor: Actor, otherUserId: string, subject: string, body: string, ctx: Context = {}, attachmentUrl?: string | null) {
  assertActive(actor);
  if (otherUserId === actor.id) throw new AppError("Conversation avec vous-même impossible");
  const other = await db.user.findUnique({ where: { id: otherUserId } });
  if (!other || other.status !== "ACTIVE") throw new AppError("Destinataire indisponible");
  const existing = await db.conversation.findFirst({
    where: {
      productId: ctx.productId ?? null, orderId: ctx.orderId ?? null, contractId: ctx.contractId ?? null,
      ...(ctx.offerId ? { offerId: ctx.offerId } : {}),
      AND: [{ participants: { some: { userId: actor.id } } }, { participants: { some: { userId: otherUserId } } }],
    },
  });
  const conv = existing ?? await db.conversation.create({
    data: {
      subject: subject.slice(0, 120), ...ctx,
      participants: { create: [{ userId: actor.id, lastReadAt: new Date() }, { userId: otherUserId }] },
    },
  });
  await sendMessage(actor, conv.id, body, attachmentUrl);
  return conv;
}

export async function sendMessage(actor: Actor, conversationId: string, body: string, attachmentUrl?: string | null) {
  assertActive(actor);
  const text = body.trim();
  if (!text && !attachmentUrl) throw new AppError("Message vide");
  if (text.length > 5000) throw new AppError("Message trop long");
  const part = await db.conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId, userId: actor.id } } });
  if (!part) throw new ForbiddenError();
  const now = new Date();
  await db.$transaction([
    db.message.create({ data: { conversationId, senderId: actor.id, body: text, attachmentUrl: attachmentUrl ?? null } }),
    db.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: now } }),
    db.conversationParticipant.update({ where: { conversationId_userId: { conversationId, userId: actor.id } }, data: { lastReadAt: now } }),
  ]);
  const others = await db.conversationParticipant.findMany({ where: { conversationId, userId: { not: actor.id } } });
  for (const o of others) {
    // Une notification par conversation non lue (pas de rafale).
    const unreadNotif = await db.notification.count({ where: { userId: o.userId, type: "message.new", link: `/messages/${conversationId}`, readAt: null } });
    if (!unreadNotif) await notify(o.userId, "message.new", "Nouveau message", `${actor.displayName} : ${text.slice(0, 120)}`, `/messages/${conversationId}`);
  }
}

export async function listConversations(userId: string) {
  const convs = await db.conversation.findMany({
    where: { participants: { some: { userId } } },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    include: {
      participants: { include: { user: { select: { id: true, displayName: true, primaryRole: true } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  return convs.map((c) => {
    const me = c.participants.find((p) => p.userId === userId);
    const last = c.messages[0];
    return {
      ...c,
      others: c.participants.filter((p) => p.userId !== userId).map((p) => p.user),
      unread: !!last && last.senderId !== userId && (!me?.lastReadAt || me.lastReadAt < last.createdAt),
    };
  });
}

export async function getConversation(actor: Actor, id: string) {
  const conv = await db.conversation.findUnique({
    where: { id },
    include: {
      participants: { include: { user: { select: { id: true, displayName: true, primaryRole: true } } } },
      messages: { orderBy: { createdAt: "asc" }, take: 500, include: { sender: { select: { id: true, displayName: true } } } },
    },
  });
  if (!conv || !conv.participants.some((p) => p.userId === actor.id)) {
    if (!conv || !actor.roles.includes("ADMIN")) throw new ForbiddenError();
  }
  await db.conversationParticipant.updateMany({ where: { conversationId: id, userId: actor.id }, data: { lastReadAt: new Date() } });
  await db.notification.updateMany({ where: { userId: actor.id, link: `/messages/${id}`, readAt: null }, data: { readAt: new Date() } });
  return conv;
}

export async function unreadConversations(userId: string) {
  const list = await listConversations(userId);
  return list.filter((c) => c.unread).length;
}
