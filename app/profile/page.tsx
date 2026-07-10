import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Profile and impact are one surface now — the account's identity header plus
// its role-matched stats all live on /impact. Kept as a redirect so the avatar
// link and any old bookmarks still land on the merged page.
export default async function ProfilePage() {
  redirect("/impact");
}
