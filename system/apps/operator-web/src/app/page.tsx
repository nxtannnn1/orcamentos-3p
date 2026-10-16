import { BudgetQueue } from "../components/budget-queue";
import { requirePageSession } from "../server/auth/session";
import { comparisonSource } from "../server/data-source/price-comparison-factory";
export const dynamic = "force-dynamic";
export default async function Home() {
  await requirePageSession();
  let showPriceComparison = false;
  try { showPriceComparison = comparisonSource() !== "operator-api"; } catch { /* fonte inválida: API apresenta o erro seguro */ }
  return <BudgetQueue showPriceComparison={showPriceComparison} />;
}
