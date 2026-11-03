import { create } from 'zustand';

interface ConfirmRequest {
  title: string;
  text?: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

export const useConfirm = create<{ req: ConfirmRequest | null; set(r: ConfirmRequest | null): void }>((set) => ({
  req: null,
  set: (req) => set({ req }),
}));

/** Boîte de confirmation asynchrone : `if (await confirmDialog({...})) …` */
export function confirmDialog(opts: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => useConfirm.getState().set({ ...opts, resolve }));
}
