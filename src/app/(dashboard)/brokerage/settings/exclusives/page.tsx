import { getExclusiveBuildings } from "./actions";
import ExclusivesView from "./exclusives-view";

export const dynamic = "force-dynamic";

export default async function ExclusivesPage({
  searchParams,
}: {
  searchParams: Promise<{ as_org?: string }>;
}) {
  const { as_org } = await searchParams;
  const result = await getExclusiveBuildings({ page: 1, limit: 25 }, { overrideAsOrg: as_org });

  return <ExclusivesView initialData={result} />;
}
