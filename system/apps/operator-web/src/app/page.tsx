import { BudgetQueue } from "../components/budget-queue";
import { requirePageSession } from "../server/auth/session";
export default async function Home() {
  await requirePageSession();
  return <BudgetQueue />;
}
