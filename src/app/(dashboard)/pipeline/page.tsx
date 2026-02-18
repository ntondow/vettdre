import { getOrCreatePipeline, getContacts, getProperties } from "./actions";
import PipelineBoard from "./pipeline-board";

export default async function PipelinePage() {
  const { pipeline, deals, stages } = await getOrCreatePipeline();
  const contacts = await getContacts();
  const properties = await getProperties();

  // Serialize Decimal/Date objects for client component
  const serializedDeals = JSON.parse(JSON.stringify(deals));
  const serializedProperties = JSON.parse(JSON.stringify(properties));
  const serializedPipeline = JSON.parse(JSON.stringify(pipeline));

  return <PipelineBoard pipeline={serializedPipeline} deals={serializedDeals} stages={stages} contacts={contacts} properties={serializedProperties} />;
}
