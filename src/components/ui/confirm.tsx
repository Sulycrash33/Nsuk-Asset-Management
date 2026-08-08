"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import Modal from "./modal";

type ConfirmOptions = {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Promise-based replacement for window.confirm — styled, keyboard-accessible,
 * and it does not freeze the page the way the native dialog does.
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return ctx;
}

export default function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  const danger = options?.tone !== "default";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      <Modal
        open={options !== null}
        onClose={() => settle(false)}
        title={options?.title ?? ""}
        size="sm"
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => settle(false)} className="btn-ghost">
              {options?.cancelLabel ?? "Cancel"}
            </button>
            <button
              onClick={() => settle(true)}
              className={danger ? "btn bg-nsuk-danger text-white hover:bg-[#951616]" : "btn-primary"}
            >
              {options?.confirmLabel ?? "Confirm"}
            </button>
          </div>
        }
      >
        <div className="flex gap-3 pb-2">
          {danger && (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-nsuk-danger/10">
              <AlertTriangle className="h-5 w-5 text-nsuk-danger" />
            </span>
          )}
          <p className="text-sm leading-relaxed text-nsuk-muted">{options?.body}</p>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

/** Small spinner used by buttons that trigger a confirmed action. */
export function ButtonSpinner() {
  return <Loader2 className="h-4 w-4 animate-spin" />;
}
