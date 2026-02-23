import { getDealAnalyses } from "./actions";
import DealPipeline from "./deal-pipeline";

export default async function DealsPage() {
  const deals = await getDealAnalyses();
  return <DealPipeline initialDeals={deals} />;
}
