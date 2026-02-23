import { getLists } from "./actions";
import ProspectingDashboard from "./prospecting-dashboard";
import ProspectingGateWrapper from "./prospecting-gate-wrapper";

export default async function ProspectingPage() {
  const lists = await getLists();
  return (
    <ProspectingGateWrapper>
      <ProspectingDashboard lists={JSON.parse(JSON.stringify(lists))} />
    </ProspectingGateWrapper>
  );
}
