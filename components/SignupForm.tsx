"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "./Button";
import { PasswordField } from "./PasswordField";
import { cn } from "./cn";
import { inputCls, labelCls, errorBannerCls } from "./authStyles";
import { SuccessPanel, BackToSignIn, CheckIcon } from "./AuthPanels";
import { passwordValid } from "@/lib/password";
import { registerUser, findPendingInvite } from "@/app/actions";

type Role = "volunteer" | "restaurant" | "drop_off";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOTAL = 6;

const ROLES: { id: Role; label: string; blurb: string }[] = [
  { id: "volunteer", label: "Volunteer", blurb: "Claim and deliver surplus food pickups." },
  { id: "restaurant", label: "Restaurant", blurb: "Post surplus food for volunteers to claim." },
  { id: "drop_off", label: "Drop-off", blurb: "Receive and distribute rescued food." },
];
const ROLE_LABEL: Record<Role, string> = {
  volunteer: "Volunteer",
  restaurant: "Restaurant",
  drop_off: "Drop-off",
};

// Notification copy adapts to the role so the promise is concrete, not generic.
const NOTIF_COPY: Record<Role, { email: string; sms: string }> = {
  volunteer: { email: "New pickups near you.", sms: "Time-sensitive pickup alerts." },
  restaurant: { email: "Claim and reminder updates.", sms: "When a volunteer is on the way." },
  drop_off: { email: "Incoming drop-off summaries.", sms: "When a delivery is inbound." },
};

// Per-step width classes for the progress fill (no inline styles — Tailwind only).
const PROGRESS = ["w-1/6", "w-2/6", "w-3/6", "w-4/6", "w-5/6", "w-full"];

export function SignupForm() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<Role>("volunteer");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Volunteer affiliation — collected for parity; not yet persisted (registerUser
  // has no campus field), so it's local-only until the model gains one.
  const [campus, setCampus] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [restaurantAddress, setRestaurantAddress] = useState("");
  const [dropOffName, setDropOffName] = useState("");
  const [dropOffAddress, setDropOffAddress] = useState("");
  // Notification defaults shown to the user; the app re-confirms push opt-in
  // post-signup (NotificationPrimeCard), so these aren't submitted here yet.
  const [emailNotif, setEmailNotif] = useState(true);
  const [smsNotif, setSmsNotif] = useState(false);

  // A pending invite for the typed email (checked when leaving the login step).
  // When present, the invite governs role + org: no role-specific new-org fields.
  const [invite, setInvite] = useState<{ orgName: string; role: Role } | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const phoneDigits = phone.replace(/\D/g, "");
  const isLast = step === TOTAL - 1;

  // Validate the current step. Returns an error string, or null when clear.
  function validateStep(s: number): string | null {
    if (s === 1) {
      if (!name.trim()) return "Please enter your name.";
      if (phoneDigits.length !== 10) return "Please enter a valid 10-digit phone number.";
    }
    if (s === 2) {
      if (!EMAIL_RE.test(email)) return "Please enter a valid email address.";
      if (!passwordValid(password)) return "Password must be 8+ characters with an uppercase letter and a number.";
    }
    if (s === 3 && !invite) {
      if (role === "restaurant" && (!restaurantName.trim() || !restaurantAddress.trim()))
        return "Please add your restaurant's name and address.";
      if (role === "drop_off" && (!dropOffName.trim() || !dropOffAddress.trim()))
        return "Please add your site's name and address.";
    }
    return null;
  }

  async function goNext() {
    const err = validateStep(step);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    // Leaving the login step: see whether this email was invited to an org.
    if (step === 2) {
      setInvite(await findPendingInvite(email));
    }
    if (isLast) {
      await submit();
      return;
    }
    setStep((s) => s + 1);
  }

  function goBack() {
    setError(null);
    if (step === 0) {
      router.push("/login");
      return;
    }
    setStep((s) => s - 1);
  }

  function editStep(s: number) {
    setError(null);
    setStep(s);
  }

  async function submit() {
    setLoading(true);
    const res = await registerUser({
      name,
      email,
      phone,
      password,
      role,
      restaurantName: role === "restaurant" ? restaurantName : undefined,
      restaurantAddress: role === "restaurant" ? restaurantAddress : undefined,
      dropOffName: role === "drop_off" ? dropOffName : undefined,
      dropOffAddress: role === "drop_off" ? dropOffAddress : undefined,
    });

    if (!res.ok) {
      setLoading(false);
      setError(res.error);
      return;
    }
    // Restaurant/drop-off accounts wait for org-admin approval — no session yet.
    if (res.pending) {
      setLoading(false);
      setPending(true);
      return;
    }
    // Active immediately (volunteer, or joined via invite): sign in, then land
    // on "/" where middleware routes to the role's home.
    const signInRes = await signIn("credentials", {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
    });
    if (signInRes?.error) {
      setLoading(false);
      setError("Account created, but sign-in failed. Try signing in.");
      return;
    }
    setDone(true);
    setTimeout(() => {
      window.location.href = "/";
    }, 1100);
  }

  // ---- Terminal states -----------------------------------------------------

  if (done) {
    return (
      <SuccessPanel
        heading="You're all set"
        message="Welcome to Meal Move — taking you to your dashboard…"
      >
        <p className="mt-5 text-[16px]">
          <BackToSignIn />
        </p>
      </SuccessPanel>
    );
  }

  if (pending) {
    const orgName = role === "restaurant" ? restaurantName : dropOffName;
    return (
      <div className="text-center">
        <div
          aria-hidden
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rescued-100 text-rescued-600"
        >
          <CheckIcon className="h-7 w-7" />
        </div>
        <h2 className="mt-4 font-display text-2xl font-bold text-neutral-900">
          Thanks — you&apos;re almost in
        </h2>
        <p className="mx-auto mt-1.5 max-w-[36ch] text-[16px] leading-relaxed text-neutral-700">
          {ROLE_LABEL[role]} accounts are confirmed by an org admin before they go
          live. We&apos;ll email{" "}
          <span className="font-mono text-[15px] text-neutral-900">
            {email.trim().toLowerCase()}
          </span>{" "}
          once <span className="font-semibold text-neutral-900">{orgName}</span> is
          approved — then you can sign in and get started.
        </p>
        <p className="mt-5 text-[16px]">
          <BackToSignIn />
        </p>
      </div>
    );
  }

  // ---- Wizard chrome -------------------------------------------------------

  const TITLES = stepCopy(step, role, invite);

  return (
    <>
      <p className="font-mono text-[13px] text-neutral-700">
        Step {step + 1} of {TOTAL}
      </p>
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200"
        role="progressbar"
        aria-valuenow={step + 1}
        aria-valuemin={1}
        aria-valuemax={TOTAL}
      >
        <div
          className={cn(
            "h-full rounded-full bg-rescued-600 transition-[width] duration-300 ease-out",
            PROGRESS[step]
          )}
        />
      </div>

      <h1 className="mt-5 font-display text-[26px] font-bold leading-tight tracking-tight text-neutral-900">
        {TITLES.title}
      </h1>
      <p className="mb-5 mt-1.5 text-[16px] leading-relaxed text-neutral-700">
        {TITLES.sub}
      </p>

      {/* Keyed so the step re-mounts and replays the enter animation. */}
      <div key={step} className="motion-safe:animate-slide-in-right space-y-[18px]">
        {step === 0 && <RoleStep role={role} onPick={setRole} />}

        {step === 1 && (
          <>
            <Field id="name" label="Name" placeholder="Alex Rivera" value={name} onChange={setName} />
            <div>
              <Field
                id="phone"
                label="Phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                placeholder="(555) 123-4567"
                value={phone}
                onChange={setPhone}
              />
              <p className="mt-1.5 font-mono text-[13px] leading-relaxed text-neutral-700">
                Only used to coordinate pickups — never shared with admins.
              </p>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <Field
              id="email"
              label="Email"
              type="email"
              autoComplete="email"
              placeholder="you@campus.edu"
              value={email}
              onChange={setEmail}
            />
            <PasswordField
              value={password}
              onChange={setPassword}
              placeholder="Create a password"
            />
          </>
        )}

        {step === 3 && (
          <RoleSpecificStep
            invite={invite}
            role={role}
            campus={campus}
            setCampus={setCampus}
            onSkip={() => setStep((s) => s + 1)}
            restaurantName={restaurantName}
            setRestaurantName={setRestaurantName}
            restaurantAddress={restaurantAddress}
            setRestaurantAddress={setRestaurantAddress}
            dropOffName={dropOffName}
            setDropOffName={setDropOffName}
            dropOffAddress={dropOffAddress}
            setDropOffAddress={setDropOffAddress}
          />
        )}

        {step === 4 && (
          <>
            <ToggleRow
              title="Email notifications"
              desc={NOTIF_COPY[role].email}
              on={emailNotif}
              onToggle={() => setEmailNotif((v) => !v)}
            />
            <ToggleRow
              title="Text message alerts"
              desc={NOTIF_COPY[role].sms}
              on={smsNotif}
              onToggle={() => setSmsNotif((v) => !v)}
            />
          </>
        )}

        {step === 5 && (
          <ReviewStep
            invite={invite}
            role={role}
            name={name}
            phone={phone}
            email={email}
            campus={campus}
            restaurantName={restaurantName}
            restaurantAddress={restaurantAddress}
            dropOffName={dropOffName}
            dropOffAddress={dropOffAddress}
            emailNotif={emailNotif}
            smsNotif={smsNotif}
            onEdit={editStep}
          />
        )}
      </div>

      {error && (
        <p className={cn(errorBannerCls, "mt-4")} role="alert">
          {error}
        </p>
      )}

      <div className="mt-5 flex gap-2.5">
        <Button type="button" variant="secondary" onClick={goBack} disabled={loading}>
          Back
        </Button>
        <Button
          type="button"
          variant="primary"
          className="flex-1"
          onClick={goNext}
          disabled={loading}
        >
          {isLast ? (loading ? "Creating…" : "Create account") : "Continue"}
        </Button>
      </div>

      <p className="mt-5 text-center text-[16px] text-neutral-700">
        Already have an account?{" "}
        <Link href="/login" className="-mx-1 -my-2 inline-block px-1 py-2 font-bold text-rescued-600 hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}

// ---- Step copy -------------------------------------------------------------

function stepCopy(
  step: number,
  role: Role,
  invite: { orgName: string } | null
): { title: string; sub: string } {
  switch (step) {
    case 0:
      return { title: "Pick your role", sub: "How will you help move food?" };
    case 1:
      return { title: "Your details", sub: "A name and a number to reach you." };
    case 2:
      return { title: "Create your login", sub: "You'll use these every time you sign in." };
    case 3:
      if (invite)
        return { title: `Join ${invite.orgName}`, sub: "You were invited — we'll add you to the team." };
      if (role === "restaurant")
        return { title: "Your restaurant", sub: "Where volunteers will pick up surplus." };
      if (role === "drop_off")
        return { title: "Your drop-off site", sub: "Where rescued food arrives." };
      return { title: "Your campus", sub: "Where you're rescuing from, if anywhere." };
    case 4:
      return { title: "Stay in the loop", sub: "Choose how we reach you. Change anytime." };
    default:
      return { title: "Review & confirm", sub: "Make sure everything looks right." };
  }
}

// ---- Step bodies -----------------------------------------------------------

function RoleStep({ role, onPick }: { role: Role; onPick: (r: Role) => void }) {
  return (
    <div className="space-y-2.5">
      {ROLES.map((r) => {
        const selected = role === r.id;
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onPick(r.id)}
            aria-pressed={selected}
            className={cn(
              "flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2",
              selected
                ? "border-rescued-400 bg-rescued-50"
                : "border-neutral-200 bg-card hover:border-neutral-300"
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-neutral-900">{r.label}</span>
              <span className="block text-[16px] text-neutral-700">{r.blurb}</span>
            </span>
            <span
              aria-hidden
              className={cn(
                "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full transition-colors",
                selected ? "bg-rescued-600 text-white" : "border border-neutral-300"
              )}
            >
              {selected && <CheckIcon className="h-3.5 w-3.5" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function RoleSpecificStep(props: {
  invite: { orgName: string; role: Role } | null;
  role: Role;
  campus: string;
  setCampus: (v: string) => void;
  onSkip: () => void;
  restaurantName: string;
  setRestaurantName: (v: string) => void;
  restaurantAddress: string;
  setRestaurantAddress: (v: string) => void;
  dropOffName: string;
  setDropOffName: (v: string) => void;
  dropOffAddress: string;
  setDropOffAddress: (v: string) => void;
}) {
  if (props.invite) {
    return (
      <div className="rounded-md border border-rescued-200 bg-rescued-50 px-4 py-3.5 text-[16px] leading-relaxed text-rescued-800">
        You&apos;ve been invited to join{" "}
        <span className="font-semibold">{props.invite.orgName}</span>{" "}
        {props.invite.role === "restaurant" ? "as a restaurant teammate" : "as a drop-off teammate"}.
        Creating your account adds you to the team — no extra details needed.
      </div>
    );
  }

  if (props.role === "restaurant") {
    return (
      <>
        <Field id="bizname" label="Business name" placeholder="Saxby's Coffee" value={props.restaurantName} onChange={props.setRestaurantName} />
        <Field id="bizaddr" label="Pickup address" placeholder="120 Main St, Suite 4" value={props.restaurantAddress} onChange={props.setRestaurantAddress} />
      </>
    );
  }

  if (props.role === "drop_off") {
    return (
      <>
        <Field id="sitename" label="Site name" placeholder="Eastside Community Fridge" value={props.dropOffName} onChange={props.setDropOffName} />
        <Field id="siteaddr" label="Site address" placeholder="500 Elm Ave" value={props.dropOffAddress} onChange={props.setDropOffAddress} />
      </>
    );
  }

  // Volunteer — optional affiliation.
  return (
    <div>
      <Field id="campus" label="Campus or organization" placeholder="State University" value={props.campus} onChange={props.setCampus} />
      <p className="mt-1.5 text-[15px] leading-relaxed text-neutral-700">
        Optional —{" "}
        <button
          type="button"
          onClick={props.onSkip}
          className="font-semibold text-rescued-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 rounded"
        >
          skip for now
        </button>{" "}
        if you&apos;re not affiliated with one.
      </p>
    </div>
  );
}

function ReviewStep(props: {
  invite: { orgName: string; role: Role } | null;
  role: Role;
  name: string;
  phone: string;
  email: string;
  campus: string;
  restaurantName: string;
  restaurantAddress: string;
  dropOffName: string;
  dropOffAddress: string;
  emailNotif: boolean;
  smsNotif: boolean;
  onEdit: (s: number) => void;
}) {
  const notif =
    props.emailNotif && props.smsNotif
      ? "Email, SMS"
      : props.emailNotif
        ? "Email"
        : props.smsNotif
          ? "Text only"
          : "None";

  const rows: { label: string; value: string; step: number }[] = [
    { label: "Role", value: props.invite ? ROLE_LABEL[props.invite.role] : ROLE_LABEL[props.role], step: 0 },
    { label: "Name", value: props.name || "—", step: 1 },
    { label: "Phone", value: props.phone || "—", step: 1 },
    { label: "Email", value: props.email.trim().toLowerCase() || "—", step: 2 },
  ];
  if (props.invite) {
    rows.push({ label: "Joining", value: props.invite.orgName, step: 3 });
  } else if (props.role === "restaurant") {
    rows.push({ label: "Business", value: props.restaurantName || "—", step: 3 });
    rows.push({ label: "Pickup address", value: props.restaurantAddress || "—", step: 3 });
  } else if (props.role === "drop_off") {
    rows.push({ label: "Site", value: props.dropOffName || "—", step: 3 });
    rows.push({ label: "Site address", value: props.dropOffAddress || "—", step: 3 });
  } else {
    rows.push({ label: "Campus", value: props.campus || "Not set", step: 3 });
  }
  rows.push({ label: "Notifications", value: notif, step: 4 });

  return (
    <div>
      <dl className="overflow-hidden rounded-md border border-neutral-200">
        {rows.map((r, i) => (
          <div
            key={r.label}
            className={cn(
              "flex items-start gap-3 px-4 py-3",
              i > 0 && "border-t border-neutral-200"
            )}
          >
            <div className="min-w-0 flex-1">
              <dt className="font-mono text-[13px] text-neutral-700">
                {r.label}
              </dt>
              <dd className="mt-0.5 text-[16px] text-neutral-900">{r.value}</dd>
            </div>
            <button
              type="button"
              onClick={() => props.onEdit(r.step)}
              className="shrink-0 text-[16px] font-semibold text-rescued-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 rounded"
            >
              Edit
            </button>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-center text-[15px] leading-relaxed text-neutral-700">
        By creating an account you agree to our{" "}
        <Link
          href="/privacy"
          className="font-semibold text-clay-800 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 rounded"
        >
          privacy policy
        </Link>
        .
      </p>
    </div>
  );
}

// ---- Primitives ------------------------------------------------------------

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: "tel" | "email" | "text";
}) {
  return (
    <div>
      <label className={labelCls} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        className={inputCls}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function ToggleRow({
  title,
  desc,
  on,
  onToggle,
}: {
  title: string;
  desc: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-neutral-200 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-neutral-800">{title}</span>
          <span className="rounded-full bg-rescued-100 px-2 py-0.5 font-mono text-[13px] font-bold text-rescued-800">
            Recommended
          </span>
        </div>
        <p className="mt-0.5 text-[16px] text-neutral-700">{desc}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={title}
        onClick={onToggle}
        className={cn(
          "relative h-[26px] w-11 shrink-0 rounded-full transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2",
          on ? "bg-rescued-600" : "bg-neutral-300"
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-[left] duration-150",
            on ? "left-[21px]" : "left-[3px]"
          )}
        />
      </button>
    </div>
  );
}
