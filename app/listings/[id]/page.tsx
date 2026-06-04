import { ListingDetail } from "@/components/ListingDetail";
import { getListing } from "@/lib/listings";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export default async function ListingDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();
  const listing = await getListing(params.id, session?.user?.id);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <ListingDetail listing={listing} />
    </main>
  );
}
