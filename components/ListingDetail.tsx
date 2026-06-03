"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Button } from "./Button";
import { StatusBadge } from "./StatusBadge";
import { Toast, useToast } from "./Toast";
import { Clock, MapPin, Users } from "./icons";
import { cn } from "./cn";
import { advanceListing, claimListing } from "@/app/actions";
import type { Listing, ListingStatus } from "@/lib/types";

// The happy-path journey. expired / failed are terminal off-ramps and render
// their own banner rather than a step.
const JOURNEY: ListingStatus[] = ["open", "claimed", "in transit", "delivered"];

const STEP_LABEL: Record<string, string> = {
  open: "Posted",
  claimed: "Claimed",
  "in transit": "In transit",
  delivered: "Delivered",
};

function MetaRow({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <p className="flex items-center gap-2 font-mono text-xs text-neutral-600">
      <span className="text-neutral-400">{icon}</span>
      {children}
    </p>
  );
}

export function ListingDetail({ listing }: { listing: Listing | null }) {
  const { message, show } = useToast();
  const [isPending, startTransition] = useTransition();

  if (!listing) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-200 bg-white px-6 py-16 text-center">
        <p className="text-sm text-neutral-600">This listing isn&apos;t available.</p>
        <p className="mt-1 font-mono text-xs text-neutral-400">
          It may have been removed.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm font-medium text-rescued-600 hover:underline"
        >
          ← Back to the feed
        </Link>
      </div>
    );
  }

  const terminal = ["expired", "failed"].includes(listing.status);
  const currentStep = JOURNEY.indexOf(listing.status);
  const id = listing.id;

  function onClaim() {
    startTransition(async () => {
      await claimListing(id);
      show("Claimed — it's yours for the next fifteen minutes.");
    });
  }
  function onAdvance(next: "in transit" | "delivered") {
    startTransition(async () => {
      await advanceListing(id);
      show(
        next === "in transit"
          ? "On your way — drive safe."
          : "Delivered. Thank you for the rescue. 🌱"
      );
    });
  }

  return (
    <div className={cn(isPending && "opacity-70 transition-opacity")}>
      <Link
        href="/"
        className="mb-4 inline-block text-sm text-neutral-600 hover:text-neutral-900"
      >
        ← Feed
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main */}
        <div className="overflow-hidden rounded-xl border border-neutral-200/40 bg-white">
          <div
            className={cn(
              "h-[3px]",
              terminal
                ? "bg-neutral-200"
                : listing.minutesLeft < 10
                  ? "bg-failed-400"
                  : listing.minutesLeft < 35
                    ? "bg-urgent-400"
                    : "bg-rescued-400"
            )}
          />
          <div className="p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h1 className="text-[22px] font-medium leading-tight">
                  {listing.title}
                </h1>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-neutral-400">
                  {listing.id}
                </p>
              </div>
              <StatusBadge status={listing.status} />
            </div>

            <div className="space-y-2.5">
              <MetaRow icon={<MapPin />}>{listing.source}</MetaRow>
              <MetaRow icon={<Clock />}>
                {terminal
                  ? `closed ${listing.expiresAt}`
                  : `expires ${listing.expiresAt} · ${listing.minutesLeft} min left`}
              </MetaRow>
              <MetaRow icon={<Users />}>~{listing.servings} servings</MetaRow>
              {listing.dropOff && (
                <MetaRow icon={<MapPin />}>→ drop at {listing.dropOff}</MetaRow>
              )}
              {listing.claimedBy && listing.status !== "open" && (
                <MetaRow icon={<Users />}>claimed by {listing.claimedBy}</MetaRow>
              )}
            </div>

            {terminal && (
              <div
                className={cn(
                  "mt-5 rounded-md px-4 py-3 text-sm",
                  listing.status === "expired"
                    ? "bg-neutral-50 text-neutral-800"
                    : "bg-failed-50 text-failed-800"
                )}
              >
                {listing.status === "expired"
                  ? "This window closed before anyone could pick it up."
                  : "This pickup wasn't completed. The drop-off was reassigned."}
              </div>
            )}
          </div>
        </div>

        {/* Side: timeline + actions */}
        <aside className="space-y-6">
          <div className="rounded-xl border border-neutral-200/40 bg-white p-5">
            <p className="mb-4 font-mono text-[10px] uppercase tracking-wide text-neutral-600">
              Status
            </p>
            <ol className="space-y-0">
              {JOURNEY.map((step, i) => {
                const done = !terminal && i <= currentStep;
                const isLast = i === JOURNEY.length - 1;
                return (
                  <li key={step} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={cn(
                          "grid h-5 w-5 place-items-center rounded-full border text-[10px]",
                          done
                            ? "border-rescued-600 bg-rescued-600 text-white"
                            : "border-neutral-200 bg-white text-neutral-400"
                        )}
                      >
                        {done ? "✓" : i + 1}
                      </span>
                      {!isLast && (
                        <span
                          className={cn(
                            "my-1 w-px flex-1",
                            done ? "bg-rescued-200" : "bg-neutral-200"
                          )}
                        />
                      )}
                    </div>
                    <span
                      className={cn(
                        "pb-4 text-sm",
                        done ? "text-neutral-900" : "text-neutral-400"
                      )}
                    >
                      {STEP_LABEL[step]}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>

          {!terminal && (
            <div className="rounded-xl border border-neutral-200/40 bg-white p-5">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-wide text-neutral-600">
                Next step
              </p>
              {listing.status === "open" && (
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={onClaim}
                  disabled={isPending}
                >
                  Claim pickup
                </Button>
              )}
              {listing.status === "claimed" && (
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => onAdvance("in transit")}
                  disabled={isPending}
                >
                  Start delivery
                </Button>
              )}
              {listing.status === "in transit" && (
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => onAdvance("delivered")}
                  disabled={isPending}
                >
                  Mark delivered
                </Button>
              )}
              {listing.status === "delivered" && (
                <p className="text-sm text-neutral-600">
                  Complete — nothing more to do. 🌱
                </p>
              )}
            </div>
          )}
        </aside>
      </div>

      <Toast message={message} />
    </div>
  );
}
