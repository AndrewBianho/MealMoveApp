"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/components/cn";
import { geocodeSuggest } from "@/lib/geocode-client";
import {
  matchEntities,
  mergeSuggestions,
  type Suggestion,
} from "@/lib/mapSuggestions";
import type { Stop } from "@/lib/tripPlan";

interface Located {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

const GROUP_LABEL: Record<Suggestion["group"], string> = {
  recent: "Recent",
  location: "On the map",
  address: "Addresses",
};

/**
 * A WAI-ARIA combobox over three suggestion sources. The two local ones
 * (recent, on-map locations) resolve synchronously, so the list is useful
 * before — and without — any network round trip.
 *
 * The in-flight geocode is aborted whenever the query changes, so a slow
 * response can never land after a newer one and overwrite the list.
 */
export function LocationSearchField({
  label,
  value,
  onChange,
  onSelect,
  restaurants,
  dropOffs,
  recent,
  placeholder,
  inputClassName,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSelect: (stop: Stop) => void;
  restaurants: Located[];
  dropOffs: Located[];
  recent: Suggestion[];
  placeholder?: string;
  inputClassName?: string;
}) {
  const baseId = useId();
  const listId = `${baseId}-listbox`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [addresses, setAddresses] = useState<Suggestion[]>([]);
  const blurTimer = useRef<number>();

  const local = matchEntities(value, restaurants, dropOffs);
  const items = mergeSuggestions(value.trim() ? [] : recent, local, addresses);

  // Debounced, cancellable address lookup.
  useEffect(() => {
    const q = value.trim();
    if (!q) {
      setAddresses([]);
      return;
    }
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      geocodeSuggest(q, ctrl.signal).then(setAddresses);
    }, 250);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [value]);

  // Keep the highlighted row in range as the list changes under it.
  useEffect(() => {
    setActive((a) => (a >= items.length ? 0 : a));
  }, [items.length]);

  useEffect(() => () => window.clearTimeout(blurTimer.current), []);

  function choose(s: Suggestion) {
    onSelect(s.stop);
    onChange(s.label);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!items.length) return;
      e.preventDefault();
      setOpen(true);
      setActive((a) =>
        e.key === "ArrowDown" ? (a + 1) % items.length : (a - 1 + items.length) % items.length
      );
      return;
    }
    if (e.key === "Enter" && open && items[active]) {
      e.preventDefault();
      choose(items[active]);
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && items.length > 0;
  // Group headers are resolved in one pass up front rather than by mutating a
  // cursor inside the render loop — reassigning during render is exactly what
  // breaks under React Compiler's memoization.
  const headers = items.map((s, i) =>
    i === 0 || s.group !== items[i - 1].group ? GROUP_LABEL[s.group] : null,
  );

  return (
    <div className="relative">
      <label className="mb-1 block font-mono text-[11px] text-neutral-700" htmlFor={baseId}>
        {label}
      </label>
      <input
        id={baseId}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList ? `${baseId}-opt-${active}` : undefined}
        className={inputClassName}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // Deferred so a pointer selection lands before the list unmounts.
        onBlur={() => {
          blurTimer.current = window.setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-dropdown mt-1 max-h-64 overflow-y-auto rounded-xl border border-neutral-900/10 bg-card py-1 shadow-lift animate-slide-down"
        >
          {items.map((s, i) => {
            const header = headers[i];
            return (
              <li key={s.id}>
                {header && (
                  <div className="px-3 pb-1 pt-2 font-mono text-[10px] text-neutral-700">
                    {header}
                  </div>
                )}
                <div
                  id={`${baseId}-opt-${i}`}
                  role="option"
                  aria-selected={i === active}
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(s)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "cursor-pointer px-3 py-2 text-sm text-neutral-900",
                    i === active && "bg-rescued-50"
                  )}
                >
                  <span className="block truncate">{s.label}</span>
                  {s.sublabel && (
                    <span className="block truncate font-mono text-[11px] text-neutral-700">
                      {s.sublabel}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
