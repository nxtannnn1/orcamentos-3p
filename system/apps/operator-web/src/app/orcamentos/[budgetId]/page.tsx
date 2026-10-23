import { ValidationWorkspace } from "../../../components/validation-workspace";
import { requirePageSession } from "../../../server/auth/session";
import { resolveDecisionAvailability } from "../../../server/data-source/decision-availability";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: PageProps<"/orcamentos/[budgetId]">) {
  const user = await requirePageSession();
  const { budgetId } = await params;

  // UI eligibility only (profile, source, configuration and session e-mail); the backend re-checks everything.
  const { canWrite, writeUnavailableReason } = resolveDecisionAvailability(user, process.env);

  return (
    <ValidationWorkspace
      key={budgetId}
      budgetId={budgetId}
      canWrite={canWrite}
      writeUnavailableReason={writeUnavailableReason}
    />
  );
}
