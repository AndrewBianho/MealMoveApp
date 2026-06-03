"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Listing, ListingStatus } from "@/lib/types";

// Session-scoped client store. Stands in for the database so every role reads
// and writes one source of truth: a restaurant post shows up on the volunteer
// feed, a claim shows up under "My pickups", etc. Resets on full reload —
// persistence is the job of the Prisma/Supabase layer that replaces this.

interface ListingsContextValue {
  listings: Listing[];
  claim: (id: string, by?: string) => void;
  /** Advance along claimed → in transit → delivered. */
  advance: (id: string) => void;
  post: (listing: Listing) => void;
  getById: (id: string) => Listing | undefined;
}

const ListingsContext = createContext<ListingsContextValue | null>(null);

const NEXT_STATUS: Partial<Record<ListingStatus, ListingStatus>> = {
  claimed: "in transit",
  "in transit": "delivered",
};

export function ListingsProvider({
  initial,
  children,
}: {
  initial: Listing[];
  children: ReactNode;
}) {
  const [listings, setListings] = useState<Listing[]>(initial);

  const claim = useCallback((id: string, by = "You") => {
    setListings((prev) =>
      prev.map((l) =>
        l.id === id ? { ...l, status: "claimed", claimedBy: by } : l
      )
    );
  }, []);

  const advance = useCallback((id: string) => {
    setListings((prev) =>
      prev.map((l) => {
        const next = NEXT_STATUS[l.status];
        return l.id === id && next ? { ...l, status: next } : l;
      })
    );
  }, []);

  const post = useCallback((listing: Listing) => {
    setListings((prev) => [listing, ...prev]);
  }, []);

  const getById = useCallback(
    (id: string) => listings.find((l) => l.id === id),
    [listings]
  );

  const value = useMemo(
    () => ({ listings, claim, advance, post, getById }),
    [listings, claim, advance, post, getById]
  );

  return (
    <ListingsContext.Provider value={value}>
      {children}
    </ListingsContext.Provider>
  );
}

export function useListings(): ListingsContextValue {
  const ctx = useContext(ListingsContext);
  if (!ctx) {
    throw new Error("useListings must be used within a ListingsProvider");
  }
  return ctx;
}
