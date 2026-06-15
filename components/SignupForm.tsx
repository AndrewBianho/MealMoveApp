"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "./Button";
import { PasswordField } from "./PasswordField";
import { cn } from "./cn";
import { passwordValid } from "@/lib/password";
import { registerUser, findPendingInvite } from "@/app/actions";

type Role = "volunteer" | "restaurant" | "drop_off_admin";

const ROLE_LABELS: Record<Role, string> = {
  volunteer: "Volunteer",
  restaurant: "Restaurant",
  drop_off_admin: "Drop-off",
};

export function SignupForm() {
  const [role, setRole] = useState<Role>("volunteer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [restaurantAddress, setRestaurantAddress] = useState("");
  const [dropOffName, setDropOffName] = useState("");
  const [dropOffAddress, setDropOffAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Set once a restaurant/drop-off sign-up is submitted — their account is
  // pending an org admin's approval, so we can't sign them in yet.
  const [pending, setPending] = useState(false);
  // A pending invite for the typed email, if any — joining an existing org takes
  // over the form (no role picker, no new-org fields).
  const [invite, setInvite] = useState<{
    orgName: string;
    role: Role;
  } | null>(null);

  async function onEmailBlur() {
    const e = email.trim();
    if (!e) {
      setInvite(null);
      return;
    }
    setInvite(await findPendingInvite(e));
  }

  // Every field must be filled and valid before we try to register. Rather than
  // disable the button, we let the user click and tell them what's missing.
  // When joining via invite, the role picker and new-org fields don't apply.
  const incomplete =
    !name.trim() ||
    !email.trim() ||
    phone.replace(/\D/g, "").length !== 10 ||
    !passwordValid(password) ||
    (!invite &&
      role === "restaurant" &&
      (!restaurantName.trim() || !restaurantAddress.trim())) ||
    (!invite &&
      role === "drop_off_admin" &&
      (!dropOffName.trim() || !dropOffAddress.trim()));

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
      dropOffName: role === "drop_off_admin" ? dropOffName : undefined,
      dropOffAddress: role === "drop_off_admin" ? dropOffAddress : undefined,
    });

    if (!res.ok) {
      setError(res.error);
      setLoading(false);
      return;
    }

    // Restaurant/drop-off accounts wait for org-admin approval — no session yet.
    if (res.pending) {
      setLoading(false);
      setPending(true);
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
    "w-full rounded-md border border-neutral-200/60 bg-card px-3 py-2 text-sm " +
    "placeholder:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 " +
    "focus-visible:ring-transit-400 focus-visible:ring-offset-1";
  const labelCls =
    "mb-1.5 block font-mono text-[10px] uppercase tracking-wide text-neutral-700";

  if (pending) {
    return (
      <div className="rounded-2xl bg-rescued-50 px-5 py-6 text-rescued-800">
        <h2 className="font-display text-2xl font-semibold">Thanks — you&apos;re almost in</h2>
        <p className="mt-2 text-sm leading-relaxed">
          {role === "restaurant" ? "Restaurant" : "Drop-off"} accounts are
          confirmed by an org admin before they go live. We&apos;ll email{" "}
          <span className="font-mono text-[13px]">{email.trim().toLowerCase()}</span>{" "}
          once <span className="font-medium">{role === "restaurant" ? restaurantName : dropOffName}</span>{" "}
          is approved — then you can sign in and get started.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {invite ? (
        <div className="rounded-md bg-rescued-50 px-4 py-3 text-sm text-rescued-800">
          You&apos;ve been invited to join{" "}
          <span className="font-medium">{invite.orgName}</span>{" "}
          {invite.role === "restaurant"
            ? "as a restaurant teammate"
            : "as a drop-off admin"}
          . Creating your account adds you to the team.
        </div>
      ) : (
        <div>
          <span className={labelCls}>I am a</span>
          <div className="flex rounded-md border border-neutral-200/60 p-1">
            {(["volunteer", "restaurant", "drop_off_admin"] as Role[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={cn(
                  "flex-1 rounded px-3 py-1.5 text-sm transition-colors",
                  role === r
                    ? "bg-neutral-900 font-medium text-neutral-50"
                    : "text-neutral-700 hover:text-neutral-900"
                )}
              >
                {ROLE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>
      )}

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
        <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-neutral-700">
          Your number won&apos;t be shared with admins — it&apos;s only used to
          coordinate pickups.
        </p>
      </div>

      {!invite && role === "restaurant" && (
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

      {!invite && role === "drop_off_admin" && (
        <>
          <div>
            <label className={labelCls} htmlFor="dname">
              Drop-off location name
            </label>
            <input
              id="dname"
              className={fieldCls}
              placeholder="Campus Center pantry"
              value={dropOffName}
              onChange={(e) => setDropOffName(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="daddr">
              Address
            </label>
            <input
              id="daddr"
              className={fieldCls}
              placeholder="123 Main St"
              value={dropOffAddress}
              onChange={(e) => setDropOffAddress(e.target.value)}
            />
            <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-neutral-700">
              Your location starts open to all food types — you can refine what it
              accepts later.
            </p>
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
          onBlur={onEmailBlur}
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
