"use client";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/actions";
import { Alert, buttonClass } from "./index";

type Act = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/** Formulaire relié à une action serveur : état d'envoi, erreurs et confirmations. */
export function Form({ action, children, className, resetOnSuccess, showOk = true }: { action: Act; children: ReactNode; className?: string; resetOnSuccess?: boolean; showOk?: boolean }) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok && resetOnSuccess) ref.current?.reset(); }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {state?.error && <div className="mb-4"><Alert tone="danger">{state.error}</Alert></div>}
      {showOk && state?.ok && <div className="mb-4"><Alert tone="success">{state.ok}</Alert></div>}
      {children}
    </form>
  );
}

export function Submit({ children, variant = "primary", size = "md", className, name, value, confirm }: {
  children: ReactNode; variant?: Parameters<typeof buttonClass>[0]; size?: Parameters<typeof buttonClass>[1]; className?: string; name?: string; value?: string; confirm?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} className={buttonClass(variant, size, className)}
      onClick={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}>
      {pending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : null}
      {children}
    </button>
  );
}

/** Bouton d'action simple (un formulaire caché avec des champs). */
export function ActionButton({ action, fields = {}, children, variant = "secondary", size = "sm", confirm, className }: {
  action: Act; fields?: Record<string, string>; children: ReactNode; variant?: Parameters<typeof buttonClass>[0]; size?: Parameters<typeof buttonClass>[1]; confirm?: string; className?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="inline-flex flex-col items-start gap-1">
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Submit variant={variant} size={size} confirm={confirm} className={className}>{children}</Submit>
      {state?.error && <span className="max-w-xs text-xs text-danger">{state.error}</span>}
    </form>
  );
}
