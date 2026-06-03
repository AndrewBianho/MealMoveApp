"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "./Button";
import { cn } from "./cn";
import { registerUser } from "@/app/actions";

type Role = "volunteer" | "restaurant";

export function SignupForm() {
  const [role, setRole] = useState<Role>("volunteer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [restaurantAddress, setRestaurantAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await registerUser({
      name,
      email,
      password,
      role,
      restaurantName: role === "restaurant" ? restaurantName : undefined,
      restaurantAddress: role === "restaurant" ? restaurantAddress : undefined,
    });

    if (!res.ok) {
      setError(res.error);
      setLoading(false);
      return;
    }

    // Account created — sign in and let middleware route to the role's home.
    const signInRes = await signIn("credentials", {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
    });
    setLoading(false);
    if (signInRes?.error) {
      setError("Account created, but sign-in failed. Try signing in.");
      return;
    }
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
        <span className={labelCls}>I am a</span>
        <div className="flex rounded-md border border-neutral-200/60 p-1">
          {(["volunteer", "restaurant"] as Role[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={cn(
                "flex-1 rounded px-3 py-1.5 text-sm capitalize transition-colors",
                role === r
                  ? "bg-neutral-900 font-medium text-neutral-50"
                  : "text-neutral-600 hover:text-neutral-900"
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="name">
          Your name
        </label>
        <input
          id="name"
          className={fieldCls}
          placeholder="Alex Rivera"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {role === "restaurant" && (
        <>
          <div>
            <label className={labelCls} htmlFor="rname">
              Restaurant name
            </label>
            <input
              id="rname"
              className={fieldCls}
              placeholder="Saxbys — Commons"
              value={restaurantName}
              onChange={(e) => setRestaurantName(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="raddr">
              Address <span className="text-neutral-400">(optional)</span>
            </label>
            <input
              id="raddr"
              className={fieldCls}
              placeholder="123 Main St"
              value={restaurantAddress}
              onChange={(e) => setRestaurantAddress(e.target.value)}
            />
          </div>
        </>
      )}

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
        <label className={labelCls} htmlFor="password">
          Password <span className="text-neutral-400">(8+ characters)</span>
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
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
        disabled={loading || !name || !email || password.length < 8}
      >
        {loading ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
