"use client";

import { useState, useTransition } from "react";
import { Button } from "./Button";
import { Toast, useToast } from "./Toast";
import { saveOrgNotes } from "@/app/actions";

// An org-admin-editable "notes & contacts" panel for one restaurant or drop-off.
// This is the chapter's relationship memory — the human know-how (who to call,
// what's quirky) that otherwise walks out the door when founders graduate. Calm,
// plain fields; a view → edit toggle mirroring DropOffNotesEditor.

export interface OrgNotesValues {
  primaryContact: string;
  contactInfo: string;
  lastContactDate: string; // "YYYY-MM-DD" or ""
  quirks: string;
}

function prettyDate(value: string): string {
  if (!value) return "";
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

export function OrgNotesPanel({
  entity,
  id,
  initial,
}: {
  entity: "restaurant" | "drop_off";
  id: string;
  initial: OrgNotesValues;
}) {
  const [values, setValues] = useState<OrgNotesValues>(initial);
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { message, show } = useToast();

  function set<K extends keyof OrgNotesValues>(key: K, v: OrgNotesValues[K]) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  function save() {
    startTransition(async () => {
      const res = await saveOrgNotes(entity, id, {
        primaryContact: values.primaryContact,
        contactInfo: values.contactInfo,
        lastContactDate: values.lastContactDate,
        quirks: values.quirks,
      });
      if (res.ok) {
        setEditing(false);
        show("Notes saved.");
      } else {
        show(res.error);
      }
    });
  }

  const isEmpty =
    !values.primaryContact && !values.contactInfo && !values.lastContactDate && !values.quirks;

  if (!editing) {
    return (
      <div className="mt-3 border-t border-neutral-200/60 pt-3">
        <p className="font-mono text-[10px] text-neutral-700">
          Notes & contacts
        </p>
        {isEmpty ? (
          <p className="mt-1 text-sm italic text-neutral-700">
            No relationship notes yet.
          </p>
        ) : (
          <dl className="mt-2 space-y-1.5 text-sm">
            {values.primaryContact && (
              <div>
                <dt className="font-mono text-[11px] text-neutral-700">Primary contact</dt>
                <dd className="text-neutral-900">{values.primaryContact}</dd>
              </div>
            )}
            {values.contactInfo && (
              <div>
                <dt className="font-mono text-[11px] text-neutral-700">Reach them</dt>
                <dd className="text-neutral-900">{values.contactInfo}</dd>
              </div>
            )}
            {values.lastContactDate && (
              <div>
                <dt className="font-mono text-[11px] text-neutral-700">Last contact</dt>
                <dd className="text-neutral-900">{prettyDate(values.lastContactDate)}</dd>
              </div>
            )}
            {values.quirks && (
              <div>
                <dt className="font-mono text-[11px] text-neutral-700">Quirks</dt>
                <dd className="whitespace-pre-wrap text-neutral-900">{values.quirks}</dd>
              </div>
            )}
          </dl>
        )}
        <button
          onClick={() => setEditing(true)}
          className="-mx-1 mt-2 inline-block rounded px-1 py-2 text-xs font-medium text-clay-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400"
        >
          {isEmpty ? "Add notes" : "Edit notes"}
        </button>
      </div>
    );
  }

  const inputCls =
    "mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm placeholder:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rescued-400";

  return (
    <div className="mt-3 border-t border-neutral-200/60 pt-3">
      <p className="font-mono text-[10px] text-neutral-700">
        Notes & contacts
      </p>

      <label className="mt-2 block text-sm">
        <span className="text-neutral-700">Primary contact</span>
        <input
          type="text"
          value={values.primaryContact}
          onChange={(e) => set("primaryContact", e.target.value)}
          placeholder="e.g. Maria, closing manager"
          className={inputCls}
        />
      </label>

      <label className="mt-2 block text-sm">
        <span className="text-neutral-700">How to reach them</span>
        <input
          type="text"
          value={values.contactInfo}
          onChange={(e) => set("contactInfo", e.target.value)}
          placeholder="phone or email"
          className={inputCls}
        />
      </label>

      <label className="mt-2 block text-sm">
        <span className="text-neutral-700">Last contact</span>
        <input
          type="date"
          value={values.lastContactDate}
          onChange={(e) => set("lastContactDate", e.target.value)}
          className={inputCls}
        />
      </label>

      <label className="mt-2 block text-sm">
        <span className="text-neutral-700">Quirks & know-how</span>
        <textarea
          rows={3}
          value={values.quirks}
          onChange={(e) => set("quirks", e.target.value)}
          placeholder="e.g. bring a cooler bag · dead on Tuesdays · ask for the back door"
          className={inputCls}
        />
      </label>

      <div className="mt-3 flex gap-2">
        <Button variant="primary" onClick={save} disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setValues(initial);
            setEditing(false);
          }}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
      <Toast message={message} />
    </div>
  );
}
