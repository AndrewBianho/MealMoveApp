"use client";

import { useState } from "react";
import { Button } from "./Button";
import { inputCls, labelCls, errorBannerCls } from "./authStyles";
import { BackToSignIn } from "./AuthPanels";
import { requestPasswordReset } from "@/app/actions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RequestResetForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!EMAIL_RE.test(email)) {
      setError("Enter the email tied to your account.");
      return;
    }
    setLoading(true);
    await requestPasswordReset(email);
    setLoading(false);
    setSent(true);
  }

  // The confirmation is intentionally the same whether or not the email exists,
  // so the page never reveals which addresses have accounts.
  if (sent) {
    return (
      <div className="text-center">
        <div
          aria-hidden
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rescued-100 text-rescued-600"
        >
          <MailIcon className="h-7 w-7" />
        </div>
        <h1 className="mt-4 font-display text-2xl font-bold text-neutral-900">
          Check your inbox
        </h1>
        <p className="mx-auto mt-1.5 max-w-[36ch] text-[16px] leading-relaxed text-neutral-700">
          If an account exists for{" "}
          <span className="font-semibold text-neutral-900">
            {email.trim().toLowerCase()}
          </span>
          , we&apos;ve sent a reset link. It expires in 1 hour.
        </p>
        <p className="mt-4 text-[16px] text-neutral-700">
          Didn&apos;t get it?{" "}
          <button
            type="button"
            onClick={() => setSent(false)}
            className="font-bold text-rescued-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2 rounded"
          >
            Resend
          </button>
        </p>
        <p className="mt-5 text-[16px]">
          <BackToSignIn />
        </p>
      </div>
    );
  }

  return (
    <>
      <h1 className="font-display text-[26px] font-bold leading-tight tracking-tight text-neutral-900">
        Reset your password
      </h1>
      <p className="mb-6 mt-1.5 text-[16px] leading-relaxed text-neutral-700">
        Enter the email tied to your account and we&apos;ll send a reset link.
      </p>

      <form onSubmit={onSubmit} className="space-y-[18px]">
        <div>
          <label className={labelCls} htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            className={inputCls}
            placeholder="you@campus.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {error && (
          <p className={errorBannerCls} role="alert">
            {error}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          className="w-full"
          disabled={loading}
        >
          {loading ? "Sending…" : "Send reset link"}
        </Button>
      </form>

      <p className="mt-5 text-center text-[16px]">
        <BackToSignIn />
      </p>
    </>
  );
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}
