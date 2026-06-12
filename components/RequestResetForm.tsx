"use client";

import { useState } from "react";
import { Button } from "./Button";
import { requestPasswordReset } from "@/app/actions";

export function RequestResetForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await requestPasswordReset(email);
    setLoading(false);
    setSent(true);
  }

  const fieldCls =
    "w-full rounded-md border border-neutral-200/60 bg-card px-3 py-2 text-sm " +
    "placeholder:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 " +
    "focus-visible:ring-transit-400 focus-visible:ring-offset-1";
  const labelCls =
    "mb-1.5 block font-mono text-[10px] uppercase tracking-wide text-neutral-600";

  // The confirmation is intentionally the same whether or not the email exists,
  // so the page never reveals which addresses have accounts.
  if (sent) {
    return (
      <div className="rounded-md bg-rescued-50 p-4">
        <p className="text-sm text-rescued-800">
          If an account exists for that email, we&apos;ve sent a reset link. It
          expires in 1 hour — check your inbox.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className={labelCls} htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          className={fieldCls}
          placeholder="you@campus.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <Button
        type="submit"
        variant="primary"
        className="w-full"
        disabled={loading || !email}
      >
        {loading ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
