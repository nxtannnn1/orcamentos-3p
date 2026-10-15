import { notFound } from "next/navigation";
import { PriceComparisonWorkspace } from "../../components/price-comparison-workspace";
import { requirePageSession } from "../../server/auth/session";
import { resolveDataSource } from "../../server/data-source/configuration";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requirePageSession();
  if (resolveDataSource() !== "mock") notFound();
  return <PriceComparisonWorkspace />;
}
