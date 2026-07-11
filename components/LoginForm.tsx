"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "./Button";
import { PasswordField } from "./PasswordField";
import { cn } from "./cn";
import { inputCls, labelCls, errorBannerCls } from "./authStyles";
import { SuccessPanel, BackToSignIn, CheckIcon } from "./AuthPanels";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Demo logins — one tap prefills the credentials for each role. Password is the
// same across all four (the seeded demo world; see prisma/reset-demo.ts).
const DEMO = [
  { role: "Volunteer", email: "you@campus.edu" },
  { role: "Restaurant", email: "saxbys@campus.edu" },
  { role: "Drop-off", email: "dropoff@campus.edu" },
  { role: "Org admin", email: "admin@campus.edu" },
] as const;
const DEMO_PASSWORD = "MealMove1";
// The demo volunteer — the "Explore the demo" one-tap lands here (the primary,
// first-time-volunteer view of the sample world).
const DEMO_VOLUNTEER = DEMO[0].email;

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Default on — matches the current always-persistent session. (Wiring the
  // off-state to a shorter session maxAge is a follow-up in auth.config.ts.)
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // Shared sign-in: used by the form submit and the one-tap "Explore the demo"
  // button. A failed sign-in has two very different causes that must read
  // differently: genuinely wrong credentials, vs. the server/DB being
  // unreachable. Auth.js only returns code "credentials" for an explicit
  // authorize rejection (wrong email/password); a thrown error inside authorize
  // — e.g. a database connection failure — comes back as a different error
  // (CallbackRouteError) with no "credentials" code, and a network failure
  // rejects outright. Only the first is the user's fault, so only it blames
  // their credentials.
  async function doSignIn(emailArg: string, passwordArg: string) {
    setError(null);
    setLoading(true);
    let res: Awaited<ReturnType<typeof signIn>> | undefined;
    try {
      res = await signIn("credentials", {
        email: emailArg,
        password: passwordArg,
        redirect: false,
      });
    } catch {
      setLoading(false);
      setError("We're having trouble signing you in right now. Please try again in a moment.");
      return;
    }
    if (res?.error) {
      setLoading(false);
      const wrongCredentials = (res as { code?: string }).code === "credentials";
      setError(
        wrongCredentials
          ? "That email and password don't match. Try again."
          : "We're having trouble signing you in right now. Please try again in a moment."
      );
      return;
    }
    // Show the payoff for a calm beat, then land on "/"; middleware bounces each
    // role to its own home.
    setDone(true);
    setTimeout(() => {
      window.location.href = "/";
    }, 900);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!EMAIL_RE.test(email) || !password) {
      setError("Enter your email and password to continue.");
      return;
    }
    await doSignIn(email, password);
  }

  // One tap into the demo world — signs straight in as the demo volunteer.
  function exploreDemo() {
    setEmail(DEMO_VOLUNTEER);
    setPassword(DEMO_PASSWORD);
    void doSignIn(DEMO_VOLUNTEER, DEMO_PASSWORD);
  }

  function prefillDemo(demoEmail: string) {
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    setError(null);
  }

  if (done) {
    return (
      <SuccessPanel heading="You're in" message="Taking you to your pickups…">
        <p className="mt-5 text-[16px]">
          <BackToSignIn />
        </p>
      </SuccessPanel>
    );
  }

  return (
    <>
      <h1 className="font-display text-[30px] font-bold leading-[1.05] tracking-tight text-neutral-900">
        Welcome back
      </h1>
      <p className="mb-6 mt-1.5 text-[16px] leading-relaxed text-neutral-700">
        Sign in to claim pickups and track your rescues.
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

        <PasswordField
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          showRules={false}
          labelRight={
            <Link
              href="/forgot-password"
              className="-mx-1.5 -my-2 inline-block px-1.5 py-2 font-mono text-[13px] text-rescued-600 hover:underline"
            >
              Forgot?
            </Link>
          }
        />

        <button
          type="button"
          onClick={() => setRemember((r) => !r)}
          className="-my-2 flex items-center gap-2.5 rounded py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
          aria-pressed={remember}
        >
          <span
            className={cn(
              "flex h-[18px] w-[18px] items-center justify-center rounded-md transition-colors",
              remember
                ? "bg-rescued-600 text-white"
                : "border border-neutral-300 bg-card"
            )}
            aria-hidden
          >
            {remember && <CheckIcon className="h-3 w-3" />}
          </span>
          <span className="text-[16px] text-neutral-800">Remember me</span>
        </button>

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
          {loading ? "Signing in…" : "Log in"}
        </Button>
      </form>

      <p className="mt-5 text-center text-[16px] text-neutral-700">
        New to Meal Move?{" "}
        <Link
          href="/signup"
          className="-mx-1 -my-2 inline-block px-1 py-2 font-bold text-rescued-600 hover:underline"
        >
          Create an account
        </Link>
      </p>

      <div className="mt-5 flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-neutral-200/70" />
        <span className="font-mono text-[13px] text-neutral-700">or</span>
        <span className="h-px flex-1 bg-neutral-200/70" />
      </div>

      <button
        type="button"
        onClick={exploreDemo}
        disabled={loading}
        className={cn(
          "mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-card px-6 py-3 text-[16px] font-bold text-neutral-900 transition-all duration-200",
          "shadow-[inset_0_0_0_2px_rgb(var(--n-900)_/_0.14)] hover:-translate-y-0.5 hover:shadow-[inset_0_0_0_2px_rgb(var(--n-900)_/_0.3)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2 disabled:opacity-70 disabled:hover:translate-y-0"
        )}
      >
        Explore the demo
      </button>

      <div className="mt-6 border-t border-neutral-200/70 pt-5">
        <p className="mb-2.5 font-mono text-[13px] text-neutral-700">
          Or try a demo login
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          {DEMO.map((d) => (
            <button
              key={d.email}
              type="button"
              onClick={() => prefillDemo(d.email)}
              className={cn(
                "rounded-md border border-neutral-200 bg-neutral-50/60 px-3 py-2.5 text-[16px] font-medium text-neutral-800 transition-colors",
                "hover:border-rescued-400 hover:bg-rescued-50 hover:text-rescued-800",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2"
              )}
            >
              {d.role}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
