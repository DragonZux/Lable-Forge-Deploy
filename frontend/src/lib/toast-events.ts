import type { ToastType } from "@/components/ui/Toast";

export const APP_TOAST_EVENT = "label-forge:toast";

export interface AppToastDetail {
  message: string;
  type: ToastType;
  duration?: number;
}

export function emitAppToast(detail: AppToastDetail) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent<AppToastDetail>(APP_TOAST_EVENT, { detail }));
}
