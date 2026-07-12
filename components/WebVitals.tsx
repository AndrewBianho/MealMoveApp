"use client";
import { useReportWebVitals } from "next/web-vitals";
import { trackClient } from "@/lib/analytics/client";

// Core Web Vitals (LCP, CLS, INP, FCP, TTFB) from Next's built-in hook, piped
// into PostHog — replaces Vercel Speed Insights at no cost.
export function WebVitals() {
  useReportWebVitals((metric) => {
    trackClient("web_vitals", {
      metric: metric.name,
      value: Math.round(metric.value),
      rating: "rating" in metric ? (metric.rating ?? "") : "",
      navigationType: "navigationType" in metric ? (metric.navigationType ?? "") : "",
    });
  });
  return null;
}
