"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "./cn";
import { Button } from "./Button";
import { ImageUploadField } from "./ImageUploadField";
import { NearbyVolunteers } from "./NearbyVolunteers";
import { DonorProtectionNote } from "./DonorProtectionNote";
import { CheckIcon } from "./AuthPanels";
import { inputCls, labelCls, errorBannerCls } from "./authStyles";
import { postListing } from "@/app/actions";

// A single past post the source can re-list with one tap.
export interface PastPost {
  title: string;
  notes?: string;
}

// ---- Step model ------------------------------------------------------------

const STEP_NAMES = [
  "Item",
  "Quantity",
  "Pickup",
  "Details",
  "Keep it",
  "Photo",
  "Review",
] as const;
const TOTAL = STEP_NAMES.length;
const OPTIONAL = new Set([3, 4, 5]); // Details · Keep it · Photo

// Progress fill widths. Tailwind has no /7 fractions, so these are arbitrary
// utilities (still classes, not inline styles) — n/7 of the bar per step.
const PROGRESS = [
  "w-[14.2857%]",
  "w-[28.5714%]",
  "w-[42.8571%]",
  "w-[57.1428%]",
  "w-[71.4285%]",
  "w-[85.7142%]",
  "w-full",
];

// Relative pickup windows → minutes. "Today" runs to the end of the local day,
// so a lunch posted at 1pm stays claimable all afternoon. Computed at submit.
const PICKUPS = [
  { label: "30 minutes", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
  { label: "3 hours", minutes: 180 },
  { label: "Today", minutes: -1 }, // sentinel — resolved to end-of-day below
] as const;
type PickupLabel = (typeof PICKUPS)[number]["label"];

function minutesUntilEndOfDay(): number {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 0, 0);
  return Math.max(30, Math.round((end.getTime() - now.getTime()) / 60_000));
}

// How food should be kept. Four design-level options collapse onto the three
// backend temp bands (refrigerated + frozen both → cold); the label is the
// design fidelity, the enum is what persists.
const KEEPS = [
  { key: "refrigerated", label: "Refrigerated", hint: "Keep cold (≤40°F)", temp: "cold", icon: Snowflake },
  { key: "frozen", label: "Frozen", hint: "Keep frozen", temp: "cold", icon: Snowflake },
  { key: "hot", label: "Hot — kept warm", hint: "Keep hot (≥140°F)", temp: "hot", icon: Flame },
  { key: "room", label: "Room temp", hint: "Shelf-stable", temp: "ambient", icon: Thermometer },
] as const;
type KeepKey = (typeof KEEPS)[number]["key"] | "";

function suggestedCars(weight: number): number {
  return weight > 0 ? Math.max(1, Math.ceil(weight / 60)) : 1;
}

// The success recap is held in sessionStorage, not just React state: posting
// calls a server action that revalidates this route, which refreshes the page
// and would otherwise wipe an in-state success screen back to step 1. Restoring
// from sessionStorage on mount keeps the payoff screen up through that refresh.
type Posted = { title: string; cars: number; pickup: string };
const POSTED_KEY = "mm.postSurplusDone";

function readPosted(): Posted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(POSTED_KEY);
    return raw ? (JSON.parse(raw) as Posted) : null;
  } catch {
    return null;
  }
}
function writePosted(p: Posted | null) {
  try {
    if (p) sessionStorage.setItem(POSTED_KEY, JSON.stringify(p));
    else sessionStorage.removeItem(POSTED_KEY);
  } catch {
    /* private mode — success just won't survive a refresh, which is fine */
  }
}

// The wizard collects weight, not servings — but the rest of the app still
// counts meals in servings (impact, cards, celebration). Derive a servings
// figure from weight using the app's lbs-per-serving constant (0.8) so those
// stay meaningful without asking the restaurant for a second number.
function servingsFromWeight(weight: number): number {
  return Math.max(1, Math.round(weight / 0.8));
}

export function PostSurplusWizard({
  restaurant,
  restaurantId,
  nearbyVolunteers,
  pastPosts,
}: {
  restaurant: string;
  restaurantId: string;
  nearbyVolunteers: number;
  pastPosts: PastPost[];
}) {
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [weight, setWeight] = useState(0);
  const [cars, setCars] = useState<number | null>(null); // null = auto-suggested
  const [pickup, setPickup] = useState<PickupLabel>("1 hour");
  const [allergens, setAllergens] = useState("");
  const [special, setSpecial] = useState("");
  const [keep, setKeep] = useState<KeepKey>("");
  const [foodImage, setFoodImage] = useState<string | null>(null);

  // Snapshot for the success recap. Lazy-initialized from sessionStorage so it
  // survives the post-submit route refresh (see readPosted). Reset for "post
  // another"; the presence of a snapshot is what shows the success screen.
  const [posted, setPosted] = useState<Posted | null>(() => readPosted());

  const carsShown = cars ?? suggestedCars(weight);
  const isLast = step === TOTAL - 1;

  function validate(s: number): string | null {
    if (s === 0 && !title.trim()) return "Add what you're sharing to continue.";
    if (s === 1 && weight <= 0) return "Enter the weight in pounds to continue.";
    return null;
  }

  function next() {
    const err = validate(step);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    if (isLast) {
      submit();
      return;
    }
    setStep((s) => s + 1);
  }

  function back() {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  function skip() {
    setError(null);
    setStep((s) => Math.min(TOTAL - 1, s + 1));
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    const name = title.trim();
    const minutes = pickup === "Today" ? minutesUntilEndOfDay() : PICKUPS.find((p) => p.label === pickup)!.minutes;
    const temp = KEEPS.find((k) => k.key === keep)?.temp;
    try {
      await postListing({
        restaurantId,
        title: name,
        servings: servingsFromWeight(weight),
        minutes,
        weightLbs: weight,
        carsNeeded: carsShown,
        notes: special.trim() || undefined,
        allergens: allergens.split(",").map((s) => s.trim()).filter(Boolean),
        tempHandling: temp,
        imageUrl: foodImage ?? undefined,
      });
      const snapshot: Posted = { title: name, cars: carsShown, pickup };
      writePosted(snapshot);
      setPosted(snapshot);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong posting. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    writePosted(null);
    setStep(0);
    setError(null);
    setTitle("");
    setWeight(0);
    setCars(null);
    setPickup("1 hour");
    setAllergens("");
    setSpecial("");
    setKeep("");
    setFoodImage(null);
    setPosted(null);
  }

  if (posted) {
    return (
      <SuccessScreen
        posted={posted}
        nearbyVolunteers={nearbyVolunteers}
        onDone={() => {
          writePosted(null);
          router.push("/restaurant");
        }}
        onAnother={reset}
      />
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[480px] flex-col px-5 pb-6 pt-6">
      {/* Top bar: back + progress */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={back}
          disabled={step === 0}
          aria-label="Back"
          className={cn(
            "grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl border border-neutral-200 bg-card text-neutral-700 transition-colors",
            "hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400",
            step === 0 && "pointer-events-none opacity-0"
          )}
        >
          <ChevronLeft />
        </button>
        <div
          className="h-[5px] flex-1 overflow-hidden rounded-full bg-neutral-200"
          role="progressbar"
          aria-valuenow={step + 1}
          aria-valuemin={1}
          aria-valuemax={TOTAL}
        >
          <div className={cn("h-full rounded-full bg-rescued-600 transition-[width] duration-300 ease-out", PROGRESS[step])} />
        </div>
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <span className="font-mono text-[11px] uppercase tracking-wide text-neutral-700">
          Step {step + 1} of {TOTAL}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-wide text-rescued-700">
          {STEP_NAMES[step]}
        </span>
      </div>

      {/* Step body — keyed so it re-mounts and replays the enter animation. */}
      <div key={step} className="mt-6 flex-1 motion-safe:animate-slide-in-right">
        {step === 0 && (
          <ItemStep title={title} setTitle={setTitle} pastPosts={pastPosts} onPick={(t) => { setTitle(t); setError(null); }} />
        )}
        {step === 1 && (
          <QuantityStep
            weight={weight}
            setWeight={setWeight}
            carsShown={carsShown}
            isAuto={cars == null}
            onCars={setCars}
          />
        )}
        {step === 2 && <PickupStep value={pickup} onChange={setPickup} />}
        {step === 3 && (
          <DetailsStep allergens={allergens} setAllergens={setAllergens} special={special} setSpecial={setSpecial} />
        )}
        {step === 4 && <KeepStep value={keep} onChange={setKeep} />}
        {step === 5 && (
          <div>
            <StepHeading title="Add a photo?" sub="A clear photo helps a volunteer recognize the food. Optional — your restaurant photo is the fallback." />
            <ImageUploadField
              label="Food photo"
              hint="Take a photo or upload one — JPG/PNG, up to 5 MB."
              value={foodImage}
              onChange={setFoodImage}
            />
          </div>
        )}
        {step === 6 && (
          <ReviewStep
            title={title}
            source={restaurant}
            cars={carsShown}
            pickup={pickup}
            allergens={allergens}
            keep={KEEPS.find((k) => k.key === keep)?.label}
            nearbyVolunteers={nearbyVolunteers}
          />
        )}
      </div>

      {/* Footer: error + CTA + skip */}
      <div className="mt-6 space-y-3">
        {error && (
          <p className={errorBannerCls} role="alert">
            {error}
          </p>
        )}
        <Button
          type="button"
          variant="primary"
          className={cn("w-full", submitting && "opacity-70")}
          onClick={next}
          disabled={submitting}
        >
          {isLast ? (submitting ? "Posting listing…" : "Post listing") : "Continue"}
        </Button>
        {OPTIONAL.has(step) && !isLast && (
          <button
            type="button"
            onClick={skip}
            className="w-full text-center text-sm font-semibold text-neutral-600 hover:text-neutral-900 focus-visible:outline-none focus-visible:underline"
          >
            Skip for now
          </button>
        )}
        {step === 6 && <DonorProtectionNote variant="inline" />}
      </div>
    </div>
  );
}

// ---- Step bodies -----------------------------------------------------------

function StepHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-5">
      <h1 className="font-display text-[27px] font-medium leading-[1.1] tracking-tight text-neutral-900 text-balance">
        {title}
      </h1>
      {sub && <p className="mt-2 text-[15px] leading-relaxed text-neutral-700">{sub}</p>}
    </div>
  );
}

function ItemStep({
  title,
  setTitle,
  pastPosts,
  onPick,
}: {
  title: string;
  setTitle: (v: string) => void;
  pastPosts: PastPost[];
  onPick: (title: string) => void;
}) {
  return (
    <div>
      <StepHeading title="What are you sharing?" />
      <label className={labelCls} htmlFor="title">
        Title
      </label>
      <input
        id="title"
        className={inputCls}
        placeholder="e.g. Mediterranean wraps & salads"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />

      {pastPosts.length > 0 && (
        <div className="mt-7">
          <p className={labelCls}>Post again</p>
          <ul className="space-y-2">
            {pastPosts.map((p, i) => (
              <li key={`${p.title}-${i}`}>
                <button
                  type="button"
                  onClick={() => onPick(p.title)}
                  className="flex w-full items-center gap-3 rounded-xl border border-neutral-200 bg-card px-3.5 py-3 text-left transition-colors hover:border-rescued-400 hover:bg-rescued-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-rescued-50 text-rescued-700">
                    <Repeat />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-neutral-900">{p.title}</span>
                    {p.notes && <span className="block truncate text-[13px] text-neutral-600">{p.notes}</span>}
                  </span>
                  <ChevronRight />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function QuantityStep({
  weight,
  setWeight,
  carsShown,
  isAuto,
  onCars,
}: {
  weight: number;
  setWeight: (v: number) => void;
  carsShown: number;
  isAuto: boolean;
  onCars: (v: number | null) => void;
}) {
  return (
    <div>
      <StepHeading title="How much is there?" sub="Give the total weight — we'll suggest how many cars it takes to carry." />
      <div className="space-y-5">
        <Stepper
          label="Weight (lbs)"
          value={weight}
          onChange={(v) => setWeight(Math.max(0, v))}
          step={10}
        />

        <div className="rounded-2xl border border-neutral-200 bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-neutral-900">Cars needed</p>
              <p className="mt-0.5 text-[13px] text-neutral-600">
                {isAuto ? (weight > 0 ? "Suggested from the weight" : "Add the weight first") : "Manually set"}
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <span
                aria-live="polite"
                className="min-w-8 text-center text-[15px] font-semibold tabular-nums text-neutral-900"
              >
                {carsShown}
              </span>
              <CounterButtons
                value={carsShown}
                min={1}
                onChange={(v) => onCars(Math.max(1, v))}
                ariaLabel="Cars needed"
              />
            </div>
          </div>
          {!isAuto && (
            <button
              type="button"
              onClick={() => onCars(null)}
              className="mt-3 text-[13px] font-semibold text-clay-800 hover:underline focus-visible:outline-none focus-visible:underline"
            >
              Reset to suggested
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PickupStep({ value, onChange }: { value: PickupLabel; onChange: (v: PickupLabel) => void }) {
  return (
    <div>
      <StepHeading title="When can it be picked up?" sub="Volunteers see this as the window to claim and arrive." />
      <div className="space-y-2.5">
        {PICKUPS.map((p) => (
          <RadioRow key={p.label} selected={value === p.label} onClick={() => onChange(p.label)}>
            <span className="text-[15px] font-semibold text-neutral-900">{p.label}</span>
          </RadioRow>
        ))}
      </div>
    </div>
  );
}

function DetailsStep({
  allergens,
  setAllergens,
  special,
  setSpecial,
}: {
  allergens: string;
  setAllergens: (v: string) => void;
  special: string;
  setSpecial: (v: string) => void;
}) {
  return (
    <div>
      <StepHeading title="Anything to know?" sub="Optional, but allergens keep volunteers and recipients safe." />
      <div className="space-y-5">
        <div>
          <label className={labelCls} htmlFor="allergens">
            Allergens
          </label>
          <input
            id="allergens"
            className={inputCls}
            placeholder="e.g. nuts, dairy, gluten"
            value={allergens}
            onChange={(e) => setAllergens(e.target.value)}
          />
          <p className="mt-1.5 text-[11px] text-neutral-600">Comma-separated — shown to volunteers.</p>
        </div>
        <div>
          <label className={labelCls} htmlFor="special">
            Special requests / restraints
          </label>
          <textarea
            id="special"
            rows={3}
            className={inputCls}
            placeholder="e.g. keep upright · pick up at back door"
            value={special}
            onChange={(e) => setSpecial(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

function KeepStep({ value, onChange }: { value: KeepKey; onChange: (v: KeepKey) => void }) {
  return (
    <div>
      <StepHeading title="How should it be kept?" sub="Optional — helps a volunteer bring the right bag." />
      <div className="space-y-2.5">
        {KEEPS.map((k) => {
          const Icon = k.icon;
          const selected = value === k.key;
          return (
            <RadioRow key={k.key} selected={selected} onClick={() => onChange(selected ? "" : k.key)}>
              <span
                className={cn(
                  "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
                  selected ? "bg-rescued-100 text-rescued-700" : "bg-neutral-100 text-neutral-600"
                )}
              >
                <Icon />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-neutral-900">{k.label}</span>
                <span className="block text-[13px] text-neutral-600">{k.hint}</span>
              </span>
            </RadioRow>
          );
        })}
      </div>
    </div>
  );
}

function ReviewStep({
  title,
  source,
  cars,
  pickup,
  allergens,
  keep,
  nearbyVolunteers,
}: {
  title: string;
  source: string;
  cars: number;
  pickup: string;
  allergens: string;
  keep?: string;
  nearbyVolunteers: number;
}) {
  const rows: [string, string][] = [
    ["Cars needed", `${cars} ${cars === 1 ? "car" : "cars"}`],
    ["Pickup within", pickup],
    ...(allergens.trim() ? ([["Allergens", allergens.trim()]] as [string, string][]) : []),
    ...(keep ? ([["Keep it", keep]] as [string, string][]) : []),
  ];
  return (
    <div>
      <StepHeading title="Ready to post?" />
      <div className="rounded-2xl border border-neutral-200 bg-card p-5">
        <p className="font-display text-[21px] font-medium leading-tight text-neutral-900">{title || "Untitled"}</p>
        <p className="mt-1 text-[13.5px] text-neutral-600">{source}</p>
        <dl className="mt-4 space-y-2.5">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-4">
              <dt className="font-mono text-[11px] uppercase tracking-wide text-neutral-600">{k}</dt>
              <dd className="text-right text-[14px] font-semibold text-neutral-900">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <NearbyVolunteers count={nearbyVolunteers} className="mt-4" />
    </div>
  );
}

function SuccessScreen({
  posted,
  nearbyVolunteers,
  onDone,
  onAnother,
}: {
  posted: { title: string; cars: number; pickup: string };
  nearbyVolunteers: number;
  onDone: () => void;
  onAnother: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[480px] flex-col items-center justify-center px-5 py-10 text-center motion-safe:animate-fade-up">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-rescued-100 text-rescued-700">
        <CheckIcon className="h-8 w-8" />
      </span>
      <h1 className="mt-5 font-display text-[28px] font-medium tracking-tight text-neutral-900">Listing posted</h1>
      <p className="mt-1.5 text-[15px] text-neutral-700">It&apos;s live on the volunteer feed.</p>

      <div className="mt-6 w-full rounded-2xl border border-neutral-200 bg-card p-5 text-left">
        <p className="font-display text-[20px] font-medium leading-tight text-neutral-900">{posted.title}</p>
        <dl className="mt-3 space-y-2">
          <Row k="Cars needed" v={`${posted.cars} ${posted.cars === 1 ? "car" : "cars"}`} />
          <Row k="Pickup within" v={posted.pickup} />
          <Row k="Notified" v={`${nearbyVolunteers} nearby ${nearbyVolunteers === 1 ? "volunteer" : "volunteers"}`} />
        </dl>
      </div>

      <div className="mt-6 w-full space-y-2.5">
        <Button variant="primary" className="w-full" onClick={onDone}>
          Done
        </Button>
        <Button variant="secondary" className="w-full" onClick={onAnother}>
          Post another listing
        </Button>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="font-mono text-[11px] uppercase tracking-wide text-neutral-600">{k}</dt>
      <dd className="text-right text-[14px] font-semibold text-neutral-900">{v}</dd>
    </div>
  );
}

// ---- Shared controls -------------------------------------------------------

// A single-select row: tap to select; active = accent border + sage wash + a
// filled radio dot (so it never reads by color alone — the dot and border move
// together with the label).
function RadioRow({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 focus-visible:ring-offset-2",
        selected ? "border-rescued-400 bg-rescued-50" : "border-neutral-200 bg-card hover:border-neutral-300"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-colors",
          selected ? "border-rescued-600" : "border-neutral-300"
        )}
      >
        {selected && <span className="h-2.5 w-2.5 rounded-full bg-rescued-600" />}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-3">{children}</span>
    </button>
  );
}

// Labeled stepper: −, an editable number, +.
function Stepper({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-[15px] font-semibold text-neutral-900">{label}</label>
      <div className="flex items-center gap-2.5">
        <input
          type="number"
          min={0}
          value={value === 0 ? "" : value}
          placeholder="0"
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          aria-label={label}
          className="w-16 rounded-lg border border-neutral-200 bg-card px-2 py-1.5 text-center text-[15px] font-semibold text-neutral-900 [appearance:textfield] focus-visible:outline-none focus-visible:border-rescued-400 focus-visible:ring-2 focus-visible:ring-rescued-400/40 [&::-webkit-inner-spin-button]:appearance-none"
        />
        <CounterButtons value={value} min={0} step={step} onChange={onChange} ariaLabel={label} />
      </div>
    </div>
  );
}

function CounterButtons({
  value,
  onChange,
  min = 0,
  step = 1,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
  ariaLabel: string;
}) {
  const btn =
    "grid h-9 w-9 place-items-center rounded-lg border border-neutral-200 bg-card text-neutral-800 transition-colors hover:border-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400 disabled:opacity-40";
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label={`Decrease ${ariaLabel}`}
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
        className={btn}
      >
        <Minus />
      </button>
      <button type="button" aria-label={`Increase ${ariaLabel}`} onClick={() => onChange(value + step)} className={btn}>
        <Plus />
      </button>
    </div>
  );
}

// ---- Inline icons (Feather-style strokes, matching the codebase) -----------

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}
function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-neutral-400">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
function Repeat() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </svg>
  );
}
function Minus() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
      <path d="M5 12h14" />
    </svg>
  );
}
function Plus() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function Snowflake() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2v20M2 12h20m-3.5-6.5L5.5 18.5m13 0L5.5 5.5" />
    </svg>
  );
}
function Flame() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 17c1.5 0 3-1 3-3 0-2-2-3-1-5-3 .5-5 3-5 5.5Z" />
      <path d="M12 2c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4" />
    </svg>
  );
}
function Thermometer() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0Z" />
    </svg>
  );
}
