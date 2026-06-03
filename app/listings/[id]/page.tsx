import { ListingDetail } from "@/components/ListingDetail";

export default function ListingDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <ListingDetail id={params.id} />
    </main>
  );
}
