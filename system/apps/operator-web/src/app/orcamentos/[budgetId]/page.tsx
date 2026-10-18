import { ValidationWorkspace } from "../../../components/validation-workspace";
import { requirePageSession } from "../../../server/auth/session";
import { canReviewSource } from "../../../server/auth/configuration";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: PageProps<"/orcamentos/[budgetId]">) {
  const user = await requirePageSession();
  const { budgetId } = await params;

  const source = process.env.DATA_SOURCE;

  const sharePointWriteConfigured =
    process.env.SHAREPOINT_HUMAN_CORRECTIONS_ENABLED === "true" &&
    process.env.SHAREPOINT_PERSON_RESOLVER === "graph-list-permissions" &&
    !!process.env.SECURITY_REDIS_REST_URL?.trim() &&
    !!process.env.SECURITY_REDIS_REST_TOKEN?.trim();

  const canWrite =
    canReviewSource(user) &&
    source !== "operator-api" &&
    (source !== "sharepoint" || sharePointWriteConfigured);

  return (
    <ValidationWorkspace
      key={budgetId}
      budgetId={budgetId}
      canWrite={canWrite}
    />
  );
}