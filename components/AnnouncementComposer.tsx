"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "./Button";
import { Toast, useToast } from "./Toast";
import { cn } from "./cn";
import { sendAnnouncementAction, countAudienceAction } from "@/app/actions";
import {
  RELIABILITY_BANDS,
  LAPSED_DAYS,
  RADII as RADII_OPTIONS,
  type Audience,
  type AnchorKind,
  type LapsedDays,
  type RadiusMi,
  type ReliabilityBand,
} from "@/lib/segments";

const TITLE_MAX = 120;
const BODY_MAX = 2000;

export type AnchorOption = { kind: AnchorKind; id: string; name: string };

type Kind = Audience["kind"];

// Bands are named by their literal percentage threshold (the reliability
// meter's own sage ≥80 / honey 50–79 / tomato <50), so an admin aims a message
// by a measurement, not a grade. This surface shows a COUNT only — never names,
// never one person's percentage (PRODUCT.md: reliability is felt, not punished).
const KINDS: Kind[] = ["everyone", "reliability", "new", "lapsed", "near"];
const KIND_LABEL: Record<Kind, string> = {
  everyone: "Everyone",
  reliability: "By reliability",
  new: "New volunteers",
  lapsed: "Quiet lately",
  near: "Near a location",
};

// The server-side allowlists (lib/segments.ts) are the source of truth — re-
// declaring them here would silently drift if a value were added to one but
// not the other, since `cleanAudience` would reject it.
const BANDS = RELIABILITY_BANDS;
const BAND_LABEL: Record<ReliabilityBand, string> = {
  needs_support: "Low reliability · under 50%",
  finding_footing: "Medium reliability · 50–79%",
  star: "High reliability · 80%+",
};
const DAYS = LAPSED_DAYS;
const RADII = RADII_OPTIONS;

// Follows the app's nav-pill spec: fully round, ink fill when active.
function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400",
        active
          ? "bg-neutral-900 text-neutral-50"
          : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 hover:text-neutral-900"
      )}
    >
      {children}
    </button>
  );
}

// Compose card for org admins. Sending is gated behind an in-place confirm
// (no modal — matches the app's cancel-pickup pattern) because it pushes and
// emails a whole group at once.
export function AnnouncementComposer({ anchors }: { anchors: AnchorOption[] }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<Kind>("everyone");
  const [band, setBand] = useState<ReliabilityBand>("needs_support");
  const [days, setDays] = useState<LapsedDays>(30);
  const [radiusMi, setRadiusMi] = useState<RadiusMi>(5);
  const [anchorIdx, setAnchorIdx] = useState(0);
  // `null` = still counting, `"error"` = the count request failed (never
  // collapse a failure into 0 — that reads as a genuine empty group and would
  // silently arm/disarm the send button on the wrong signal).
  const [reach, setReach] = useState<number | null | "error">(null);
  const [reachLabel, setReachLabel] = useState<string>("");
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { message, show } = useToast();

  const anchor = anchors[anchorIdx];

  const audience: Audience | null = useMemo(() => {
    switch (kind) {
      case "everyone":
        return { kind: "everyone" };
      case "new":
        return { kind: "new" };
      case "reliability":
        return { kind: "reliability", band };
      case "lapsed":
        return { kind: "lapsed", days };
      case "near":
        return anchor
          ? { kind: "near", anchor: { kind: anchor.kind, id: anchor.id }, radiusMi }
          : null;
    }
  }, [kind, band, days, radiusMi, anchor]);

  // Live reach preview, debounced so stepping through options doesn't spam the
  // server. A count only — this never asks for or receives names.
  useEffect(() => {
    if (!audience) {
      setReach(0);
      setReachLabel("");
      return;
    }
    let cancelled = false;
    setReach(null);
    const timer = setTimeout(async () => {
      try {
        const res = await countAudienceAction(audience);
        if (cancelled) return;
        if (res.ok) {
          setReach(res.count);
          setReachLabel(res.label);
        } else {
          setReach("error");
        }
      } catch {
        if (!cancelled) setReach("error");
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [audience]);

  const canSend =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    !!audience &&
    typeof reach === "number" &&
    reach > 0;

  function send() {
    if (!audience) return;
    startTransition(async () => {
      const res = await sendAnnouncementAction(title, body, audience);
      setConfirming(false);
      if (res.ok) {
        show(
          `Sent to ${res.recipientCount} volunteer${res.recipientCount === 1 ? "" : "s"}.`
        );
        setTitle("");
        setBody("");
      } else {
        show(res.error);
      }
    });
  }

  return (
    <section className="rounded-2xl border border-neutral-900/5 bg-card p-5 shadow-card">
      <div className="mb-4 border-b border-neutral-200 pb-4">
        <span id="send-to-label" className="mb-2 block font-mono text-[11px] text-neutral-700">
          Send to
        </span>
        <div
          role="group"
          aria-labelledby="send-to-label"
          className="flex flex-wrap gap-1.5"
        >
          {KINDS.map((k) => (
            <Pill key={k} active={kind === k} onClick={() => setKind(k)}>
              {KIND_LABEL[k]}
            </Pill>
          ))}
        </div>

        {kind === "reliability" && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {BANDS.map((b) => (
              <Pill key={b} active={band === b} onClick={() => setBand(b)}>
                {BAND_LABEL[b]}
              </Pill>
            ))}
          </div>
        )}

        {kind === "lapsed" && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {DAYS.map((d) => (
              <Pill key={d} active={days === d} onClick={() => setDays(d)}>
                {d}+ days
              </Pill>
            ))}
          </div>
        )}

        {kind === "near" && (
          <div className="mt-3 space-y-2">
            {anchors.length === 0 ? (
              <p className="text-sm text-neutral-700">
                No locations yet — add a restaurant or drop-off first.
              </p>
            ) : (
              <>
                <select
                  value={anchorIdx}
                  onChange={(e) => setAnchorIdx(Number(e.target.value))}
                  aria-label="Location"
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
                >
                  {anchors.map((a, i) => (
                    <option key={`${a.kind}:${a.id}`} value={i}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-1.5">
                  {RADII.map((r) => (
                    <Pill key={r} active={radiusMi === r} onClick={() => setRadiusMi(r)}>
                      {r} mi
                    </Pill>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <p className="mt-3 font-mono text-[11px] text-neutral-700">
          {reach === null
            ? "Counting…"
            : reach === "error"
              ? "Couldn't check this group — try again."
              : reach === 0
                ? "No volunteers match this group right now."
                : `This will reach ${reach} volunteer${reach === 1 ? "" : "s"} — ${reachLabel}.`}
        </p>
      </div>

      <label className="block">
        <span className="mb-1 block font-mono text-[11px] text-neutral-700">Title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
          placeholder="Winter drive this Saturday"
          className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
        />
      </label>

      <label className="mt-3 block">
        <span className="mb-1 block font-mono text-[11px] text-neutral-700">Message</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
          rows={4}
          placeholder="What volunteers need to know…"
          className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
        />
        <span className="mt-1 block text-right font-mono text-[11px] text-neutral-700">
          {body.length}/{BODY_MAX}
        </span>
      </label>

      <p className="mt-2 text-[13px] text-neutral-700">
        Write warmly — volunteers are people doing a favor, not workers being policed.
      </p>

      {confirming ? (
        <div className="mt-3 rounded-xl bg-neutral-100 p-3">
          <p className="text-sm text-neutral-800">
            Send to {reachLabel || KIND_LABEL[kind]} —{" "}
            {typeof reach === "number" ? reach : 0} volunteer
            {(typeof reach === "number" ? reach : 0) === 1 ? "" : "s"}? Push and email go
            out right away.
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="primary" onClick={send} disabled={isPending}>
              {isPending ? "Sending…" : "Yes, send it"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setConfirming(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <Button variant="primary" onClick={() => setConfirming(true)} disabled={!canSend}>
            Send update
          </Button>
        </div>
      )}

      <Toast message={message} />
    </section>
  );
}
