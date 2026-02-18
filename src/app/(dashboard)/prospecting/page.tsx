import { getLists } from "./actions";
import ProspectingDashboard from "./prospecting-dashboard";

export default async function ProspectingPage() {
  const lists = await getLists();
  return <ProspectingDashboard lists={JSON.parse(JSON.stringify(lists))} />;
}
