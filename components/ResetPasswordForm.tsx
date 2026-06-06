"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "./Button";
import { PasswordField } from "./PasswordField";
import { passwordValid } from "@/lib/password";
import { resetPassword } from "@/app/actions";

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await resetPassword(token, password);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="space-y-4">
        <div className="rounded-md bg-rescued-50 p-4">
          <p className="text-sm text-rescued-800">
            Your password has been updated. You can sign in with it now.
          </p>
        </div>
        <Link href="/login">
          <Button variant="primary" className="w-full">
            Go to sign in
          </Button>
        </Link>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="space-y-4">
        <div className="rounded-md bg-failed-50 p-4">
          <p className="text-sm text-failed-800">
            This reset link is missing its token. Request a new one.
          </p>
        </div>
        <Link
          href="/forgot-password"
          className="font-medium text-rescued-600 hover:underline"
        >
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <PasswordField
        value={password}
        onChange={setPassword}
        label="New password"
      />

      {error && (
        <div className="space-y-2">
          <p className="text-sm text-failed-600">{error}</p>
          <Link
            href="/forgot-password"
            className="font-medium text-rescued-600 hover:underline"
          >
            Request a new link
          </Link>
        </div>
      )}

      <Button
        type="submit"
        variant="primary"
        className="w-full"
        disabled={loading || !passwordValid(password)}
      >
        {loading ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
