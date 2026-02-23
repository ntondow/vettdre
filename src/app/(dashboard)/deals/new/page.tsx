import DealModeler from "./deal-modeler";
import FullPageGateWrapper from "./full-page-gate-wrapper";

export default function NewDealPage() {
  return (
    <FullPageGateWrapper>
      <DealModeler />
    </FullPageGateWrapper>
  );
}
