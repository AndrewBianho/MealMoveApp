"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "./Button";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password.");
      return;
    }
    // Land on "/"; middleware bounces each role to its own home.
    window.location.href = "/";
  }

  const fieldCls =
    "w-full rounded-md border border-neutral-200/60 bg-white px-3 py-2 text-sm " +
    "placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 " +
    "focus-visible:ring-transit-400 focus-visible:ring-offset-1";
  const labelCls =
    "mb-1.5 block font-mono text-[10px] uppercase tracking-wide text-neutral-600";

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
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <label
            className="font-mono text-[10px] uppercase tracking-wide text-neutral-600"
            htmlFor="password"
          >
            Password
          </label>
          <Link
            href="/forgot-password"
            className="font-mono text-[10px] uppercase tracking-wide text-rescued-600 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          className={fieldCls}
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-failed-600">{error}</p>}

      <Button
        type="submit"
        variant="primary"
        className="w-full"
        disabled={loading || !email || !password}
      >
        {loading ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
