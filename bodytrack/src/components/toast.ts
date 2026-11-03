import { create } from 'zustand';

export interface Toast {
  id: number;
  title: string;
  text?: string;
  tone: 'success' | 'record' | 'info' | 'error';
}

interface ToastState {
  toasts: Toast[];
  push(t: Omit<Toast, 'id'>, ms?: number): void;
  dismiss(id: number): void;
}

let n = 0;
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push(t, ms = 3500) {
    const id = ++n;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id }] }));
    setTimeout(() => get().dismiss(id), ms);
  },
  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
  },
}));

export const toast = (title: string, text?: string, tone: Toast['tone'] = 'success', ms?: number) => useToasts.getState().push({ title, text, tone }, ms);
