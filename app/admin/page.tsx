import { redirect } from "next/navigation";

// The admin console has no bare index — its tabs are their own routes. Send
// /admin (no trailing segment) to analytics, the org admin's home base, so a
// bare or bookmarked /admin URL lands somewhere sensible instead of 404ing.
export default function AdminIndexPage() {
  redirect("/admin/analytics");
}
