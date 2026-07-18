"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "./Button";
import { PasswordField } from "./PasswordField";
import { inputCls, labelCls, errorBannerCls } from "./authStyles";
import { passwordValid } from "@/lib/password";
import { acceptOrgAdminInvite } from "@/app/actions";

// Format up to 10 digits as (123) 456-7890 while typing.
function prettyPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function AcceptOrgAdminForm({
  token,
  suggestedEmail,
}: {
  token: string;
  suggestedEmail: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState(suggestedEmail);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneOk = phone.replace(/\D/g, "").length === 10;
  const canSubmit =
    name.trim() !== "" && email.trim() !== "" && phoneOk && passwordValid(password);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await acceptOrgAdminInvite({ token, name, email, phone, password });
    if (!res.ok) {
      setLoading(false);
      setError(res.error);
      return;
    }
    // Account created — sign in with the credentials they just set, then land on
    // "/"; middleware routes an org_admin to their home.
    try {
      const signInRes = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });
      if (signInRes?.error) {
        setLoading(false);
        setError(
          "Your account was created, but automatic sign-in failed. Please sign in."
        );
        return;
      }
    } catch {
      setLoading(false);
      setError(
        "Your account was created, but automatic sign-in failed. Please sign in."
      );
      return;
    }
    window.location.href = "/";
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <p className={errorBannerCls} role="alert">
          {error}
        </p>
      )}

      <div>
        <label htmlFor="accept-name" className={labelCls}>
          Full name
        </label>
        <input
          id="accept-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="accept-email" className={labelCls}>
          Email
        </label>
        <input
          id="accept-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="accept-phone" className={labelCls}>
          Phone number
        </label>
        <input
          id="accept-phone"
          value={phone}
          onChange={(e) => setPhone(prettyPhone(e.target.value))}
          inputMode="tel"
          autoComplete="tel"
          placeholder="(555) 123-4567"
          className={inputCls}
        />
      </div>

      <PasswordField value={password} onChange={setPassword} label="Password" />

      <Button
        type="submit"
        variant="primary"
        className="w-full"
        disabled={loading || !canSubmit}
      >
        {loading ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
