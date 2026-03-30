import { getExclusiveBuildings } from "./actions";
import ExclusivesView from "./exclusives-view";

export const dynamic = "force-dynamic";

export default async function ExclusivesPage() {
  const result = await getExclusiveBuildings({ page: 1, limit: 25 });

  return <ExclusivesView initialData={result} />;
}
