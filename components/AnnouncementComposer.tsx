"use client";

import { useState, useTransition } from "react";
import { Button } from "./Button";
import { Toast, useToast } from "./Toast";
import { sendAnnouncementAction } from "@/app/actions";

const TITLE_MAX = 120;
const BODY_MAX = 2000;

// Compose card for org admins. Sending is gated behind an in-place confirm
// (no modal — matches the app's cancel-pickup pattern) because it blasts push +
// email to every volunteer at once.
export function AnnouncementComposer() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { message, show } = useToast();

  const canSend = title.trim().length > 0 && body.trim().length > 0;

  function send() {
    startTransition(async () => {
      const res = await sendAnnouncementAction(title, body);
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

      {confirming ? (
        <div className="mt-3 rounded-xl bg-neutral-100 p-3">
          <p className="text-sm text-neutral-800">
            Send this to every active volunteer? Push and email go out right away.
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="primary" onClick={send} disabled={isPending}>
              {isPending ? "Sending…" : "Yes, send it"}
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={isPending}>
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
