"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "./cn";
import { primaryFill } from "./styles";
import type { Role } from "@/lib/types";

interface Message {
  id: string;
  body: string;
  createdAt: string;
  senderId: string;
  senderName: string;
  senderRole: Role;
}

const ROLE_LABEL: Record<Role, string> = {
  volunteer: "volunteer",
  restaurant: "restaurant",
  drop_off_admin: "drop-off",
  org_admin: "org admin",
};

const POLL_MS = 4000;

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * The shared coordination thread for a claim — volunteer, restaurant, and
 * drop-off in one conversation. Polls the chat route (same idiom as check-ins)
 * rather than holding a socket open; goes read-only once the claim ends.
 */
export function ChatPanel({
  listingId,
  viewerId,
}: {
  listingId: string;
  viewerId: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [active, setActive] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sinceRef = useRef<string | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    try {
      const qs = sinceRef.current
        ? `?since=${encodeURIComponent(sinceRef.current)}`
        : "";
      const res = await fetch(`/api/chat/${listingId}${qs}`);
      if (!res.ok) return;
      const data = (await res.json()) as { active: boolean; messages: Message[] };
      setActive(data.active);
      if (data.messages.length > 0) {
        sinceRef.current = data.messages[data.messages.length - 1].createdAt;
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          return [...prev, ...data.messages.filter((m) => !seen.has(m.id))];
        });
      }
    } catch {
      // Transient network hiccup — the next tick will retry.
    }
  }, [listingId]);

  // Poll on mount and every few seconds, pausing while the tab is hidden.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      poll();
      timer = setInterval(poll, POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () =>
      document.hidden ? stop() : start();

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [poll]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/chat/${listingId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Couldn't send.");
      }
      setDraft("");
      await poll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-200/40 bg-white p-5 shadow-card">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-wide text-neutral-600">
        Coordination chat
      </p>

      <div className="mb-3 max-h-72 space-y-3 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-[13px] text-neutral-600">
            No messages yet. Say hello — the restaurant and drop-off can see this
            too.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === viewerId;
            return (
              <div
                key={m.id}
                className={cn("flex flex-col", mine ? "items-end" : "items-start")}
              >
                <div className="mb-0.5 flex items-baseline gap-1.5">
                  <span className="text-[13px] font-semibold text-neutral-900">
                    {mine ? "You" : m.senderName}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wide text-neutral-400">
                    {ROLE_LABEL[m.senderRole]} · {clock(m.createdAt)}
                  </span>
                </div>
                <p
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-[13px]",
                    mine
                      ? "bg-rescued-50 text-rescued-800"
                      : "bg-neutral-50 text-neutral-900"
                  )}
                >
                  {m.body}
                </p>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {active ? (
        <form onSubmit={send} className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message the restaurant and drop-off…"
            className="min-w-0 flex-1 rounded-full border border-neutral-200 bg-white px-4 py-2 text-[13px] outline-none focus:border-rescued-400 focus:ring-2 focus:ring-rescued-200"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className={cn(
              primaryFill,
              "rounded-full px-4 py-2 text-[13px] font-bold transition-all hover:-translate-y-0.5 disabled:opacity-50"
            )}
          >
            Send
          </button>
        </form>
      ) : (
        <p className="font-mono text-[10px] uppercase tracking-wide text-neutral-400">
          Conversation closed
        </p>
      )}
      {error && <p className="mt-1.5 text-[12px] text-failed-600">{error}</p>}
    </div>
  );
}
