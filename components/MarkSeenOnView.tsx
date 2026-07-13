"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { markUpdatesSeen } from "@/app/actions";

// Marks the inbox seen on mount, then refreshes server components so the nav
// badge and feed banner (rendered in the layout header) clear. Fire-and-forget.
export function MarkSeenOnView() {
  const router = useRouter();
  useEffect(() => {
    void markUpdatesSeen().then(() => router.refresh());
  }, [router]);
  return null;
}
