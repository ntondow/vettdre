import PortfolioDashboard from "./portfolio-dashboard";
import PortfolioGateWrapper from "./portfolio-gate-wrapper";

export default function PortfoliosPage() {
  return (
    <PortfolioGateWrapper>
      <PortfolioDashboard />
    </PortfolioGateWrapper>
  );
}
