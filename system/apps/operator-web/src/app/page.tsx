import { BudgetQueue } from "../components/budget-queue";
import { requirePageSession } from "../server/auth/session";
export const dynamic = "force-dynamic";
export default async function Home() {
  await requirePageSession();
  const showPriceComparison =
    (process.env.DATA_SOURCE?.trim().toLowerCase() || "mock") === "mock";
  return <BudgetQueue showPriceComparison={showPriceComparison} />;
}
