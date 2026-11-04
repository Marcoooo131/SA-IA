import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, Paperclip } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { getConversation } from "@/server/services/messaging";
import { ForbiddenError } from "@/server/errors";
import { Container, Textarea } from "@/components/ui";
import { Form, Submit } from "@/components/ui/Form";
import { sendMessageAction } from "@/app/actions/account";
import { reportAction } from "@/app/actions/shop";
import { formatDateTime } from "@/lib/format";

export default async function Conversation({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  let conv;
  try { conv = await getConversation(actor, id); } catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }
  const others = conv.participants.filter((p) => p.userId !== actor.id).map((p) => p.user);
  return (
    <Container className="max-w-3xl py-8">
      <Link href="/messages" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-3 hover:text-ink"><ArrowLeft className="h-4 w-4" />Messagerie</Link>
      <div className="overflow-hidden rounded-[var(--radius)] border border-line bg-white">
        <div className="border-b border-line px-5 py-4">
          <p className="font-semibold">{others.map((o) => o.displayName).join(", ")}</p>
          <p className="text-sm text-ink-3">{conv.subject}
            {conv.productId && <> · <Link href={`/produit/${conv.productId}`} className="underline">voir l&apos;annonce</Link></>}
            {conv.orderId && <> · <Link href={`/commandes/${conv.orderId}`} className="underline">voir la commande</Link></>}
            {conv.offerId && <> · proposition de collaboration</>}
          </p>
        </div>
        <ol className="max-h-[60vh] space-y-3 overflow-y-auto bg-canvas/50 p-5">
          {conv.messages.map((m) => {
            const mine = m.senderId === actor.id;
            return (
              <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${mine ? "bg-ink text-white" : "border border-line bg-white"}`}>
                  {m.body && <p className="whitespace-pre-line">{m.body}</p>}
                  {m.attachmentUrl && <a href={m.attachmentUrl} target="_blank" className="mt-2 block"><Image src={m.attachmentUrl} alt="Pièce jointe" width={220} height={220} className="rounded-lg object-cover" /></a>}
                  <p className={`mt-1 text-[11px] ${mine ? "text-white/60" : "text-ink-3"}`}>{formatDateTime(m.createdAt)}</p>
                </div>
              </li>
            );
          })}
        </ol>
        <Form action={sendMessageAction} resetOnSuccess showOk={false} className="border-t border-line p-4">
          <input type="hidden" name="conversationId" value={conv.id} />
          <Textarea name="body" placeholder="Votre message…" className="min-h-20" />
          <div className="mt-2 flex items-center justify-between gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 text-sm text-ink-3 hover:text-ink"><Paperclip className="h-4 w-4" /><span>Photo</span><input type="file" name="attachment" accept="image/*" className="max-w-40 text-xs" /></label>
            <Submit>Envoyer</Submit>
          </div>
        </Form>
      </div>
      <details className="mt-3 text-xs text-ink-3"><summary className="cursor-pointer">Signaler cette conversation</summary>
        <Form action={reportAction} className="mt-2 flex gap-2"><input type="hidden" name="targetType" value="MESSAGE" /><input type="hidden" name="targetId" value={conv.id} /><input type="hidden" name="reason" value="Conversation abusive ou frauduleuse" /><Submit size="sm" variant="secondary">Signaler</Submit></Form>
      </details>
    </Container>
  );
}
