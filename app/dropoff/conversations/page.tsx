import { redirect } from "next/navigation";
import { DropOffChats } from "@/components/DropOffChats";
import { DropOffNotLinked, DropOffTabShell } from "@/components/DropOffTabShell";
import { dropOffChatThreads, loadDropOffConsole } from "@/lib/dropoffConsole";

export const dynamic = "force-dynamic";

// The Conversations tab of the drop-off console: the three-way coordination
// chats for every delivery headed here, in one place. The drop-off console
// belongs to `drop_off` accounts; org admins oversee the chapter elsewhere.
export default async function DropOffConversationsPage() {
  const { isOrgAdmin, own, viewerId, incoming } = await loadDropOffConsole();
  if (isOrgAdmin) redirect("/");
  if (!own) return <DropOffNotLinked />;

  return (
    <DropOffTabShell
      title="Conversations"
      subtitle="Every active delivery headed your way, in one place — switch between volunteers without leaving the page."
    >
      {viewerId ? (
        <DropOffChats viewerId={viewerId} threads={dropOffChatThreads(incoming)} />
      ) : (
        <p className="text-sm text-neutral-700">Sign in to coordinate deliveries.</p>
      )}
    </DropOffTabShell>
  );
}
