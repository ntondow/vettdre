import { getExclusiveBuildings } from "./actions";
import ExclusivesView from "./exclusives-view";

export const dynamic = "force-dynamic";

export default async function ExclusiveBuildingsPage() {
  const result = await getExclusiveBuildings({ page: 1, limit: 25 });

  return (
    <ExclusivesView
      initialData={result.data ?? []}
      initialTotal={result.total ?? 0}
      initialPage={result.page ?? 1}
      initialTotalPages={result.totalPages ?? 1}
    />
  );
}
