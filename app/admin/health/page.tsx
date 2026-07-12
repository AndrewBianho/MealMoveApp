import { redirect } from "next/navigation";

// Ops health merged into /admin/analytics (2026-07-12). Kept as a redirect so
// existing links/bookmarks still land somewhere sensible.
export default function AdminHealthPage() {
  redirect("/admin/analytics");
}
