import { ListingDetail } from "@/components/ListingDetail";
import { getListing } from "@/lib/listings";

export const dynamic = "force-dynamic";

export default async function ListingDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const listing = await getListing(params.id);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <ListingDetail listing={listing} />
    </main>
  );
}
