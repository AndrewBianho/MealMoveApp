"use client";
import { useEffect } from "react";
import { initClient } from "@/lib/analytics/client";

export function AnalyticsProvider() {
  useEffect(() => { initClient(); }, []);
  return null;
}
