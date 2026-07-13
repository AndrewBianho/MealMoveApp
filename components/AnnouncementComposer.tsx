"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "./Button";
import { Toast, useToast } from "./Toast";
import { cn } from "./cn";
import { sendAnnouncementAction, countAudienceAction } from "@/app/actions";
import type {
  Audience,
  AnchorKind,
  LapsedDays,
  RadiusMi,
  ReliabilityBand,
} from "@/lib/segments";

const TITLE_MAX = 120;
const BODY_MAX = 2000;

export type AnchorOption = { kind: AnchorKind; id: string; name: string };

type Kind = Audience["kind"];

// Intent-named, never deficit-named. The reliability bands aim *support*; they
// are not a grade, and this surface shows a COUNT only — never names, never
// individual percentages (PRODUCT.md: reliability is felt, not punished).
const KINDS: Kind[] = ["everyone", "reliability", "new", "lapsed", "near"];
const KIND_LABEL: Record<Kind, string> = {
  everyone: "Everyone",
  reliability: "By how it's been going",
  new: "New volunteers",
  lapsed: "Haven't been around lately",
  near: "Near a location",
};

const BANDS: ReliabilityBand[] = ["needs_support", "finding_footing", "star"];
const BAND_LABEL: Record<ReliabilityBand, string> = {
  needs_support: "Could use encouragement",
  finding_footing: "Finding their footing",
  star: "Rock solid",
};
const DAYS: LapsedDays[] = [14, 30, 60];
const RADII: RadiusMi[] = [2, 5, 10];

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
  const [reach, setReach] = useState<number | null>(null);
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
      return;
    }
    let cancelled = false;
    setReach(null);
    const timer = setTimeout(async () => {
      const res = await countAudienceAction(audience);
      if (!cancelled) setReach(res.ok ? res.count : 0);
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
    (reach ?? 0) > 0;

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
        <span className="mb-2 block font-mono text-[11px] text-neutral-700">Send to</span>
        <div className="flex flex-wrap gap-1.5">
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
            : reach === 0
              ? "No volunteers match this group right now."
              : `This will reach ${reach} volunteer${reach === 1 ? "" : "s"}.`}
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
            Send to {KIND_LABEL[kind]} — {reach ?? 0} volunteer
            {(reach ?? 0) === 1 ? "" : "s"}? Push and email go out right away.
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
