import { redirect } from "next/navigation";

// "My pickups" merged into the impact page (2026-07-05): past pickups live
// under the impact numbers, and the rescue in flight leads the feed. This
// route survives only so old links keep working.
export default function PickupsPage() {
  redirect("/impact");
}
