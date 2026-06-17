"use client";

import { useCallback, useRef, useState } from "react";

/** Minimal transient toast. One per consumer; auto-dismisses. */
export function useToast(ms = 2800) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback(
    (text: string) => {
      window.clearTimeout(timer.current);
      setMessage(text);
      timer.current = window.setTimeout(() => setMessage(null), ms);
    },
    [ms]
  );

  return { message, show };
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-toast -translate-x-1/2 animate-toast-in rounded-md border border-rescued-200 bg-card px-4 py-2.5 text-sm text-neutral-900 shadow-card"
    >
      {message}
    </div>
  );
}
