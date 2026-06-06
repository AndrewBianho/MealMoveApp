"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "./Button";
import { PasswordField } from "./PasswordField";
import { cn } from "./cn";
import { passwordValid } from "@/lib/password";
import { registerUser } from "@/app/actions";

type Role = "volunteer" | "restaurant";

export function SignupForm() {
  const [role, setRole] = useState<Role>("volunteer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [restaurantAddress, setRestaurantAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Every field must be filled and valid before we try to register. Rather than
  // disable the button, we let the user click and tell them what's missing.
  const incomplete =
    !name.trim() ||
    !email.trim() ||
    phone.replace(/\D/g, "").length !== 10 ||
    !passwordValid(password) ||
    (role === "restaurant" && (!restaurantName.trim() || !restaurantAddress.trim()));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (incomplete) {
      setError("Please complete all parts of the sign-up.");
      return;
    }

    setLoading(true);

    const res = await registerUser({
      name,
      email,
      phone,
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

      <div>
        <label className={labelCls} htmlFor="phone">
          Phone number
        </label>
        <input
          id="phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          className={fieldCls}
          placeholder="(555) 123-4567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-neutral-500">
          Your number won&apos;t be shared with admins — it&apos;s only used to
          coordinate pickups.
        </p>
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
              Address
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

      <PasswordField value={password} onChange={setPassword} />

      {error && <p className="text-sm text-failed-600">{error}</p>}

      <Button
        type="submit"
        variant="primary"
        className="w-full"
        disabled={loading}
      >
        {loading ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
