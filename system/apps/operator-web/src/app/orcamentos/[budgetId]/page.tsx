import { ValidationWorkspace } from "../../../components/validation-workspace";
import { requirePageSession } from "../../../server/auth/session";
import { canReview } from "../../../server/auth/configuration";
export const dynamic = "force-dynamic";
export default async function Page({ params }: PageProps<"/orcamentos/[budgetId]">) {
  const user = await requirePageSession();
  const { budgetId } = await params;
  return <ValidationWorkspace key={budgetId} budgetId={budgetId} canWrite={canReview(user) && process.env.DATA_SOURCE !== "operator-api"} />;
}
