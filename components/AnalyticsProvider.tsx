"use client";
import { useEffect } from "react";
import { initClient, identifyClient, resetClient } from "@/lib/analytics/client";
import type { Role } from "@/lib/analytics/events";

export function AnalyticsProvider({ userHash, role }: { userHash?: string; role?: Role }) {
  useEffect(() => {
    initClient();
    if (userHash && role) identifyClient(userHash, role);
    else resetClient();
  }, [userHash, role]);
  return null;
}
