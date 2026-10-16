import { notFound } from "next/navigation";
import { PriceComparisonWorkspace } from "../../components/price-comparison-workspace";
import { requirePageSession } from "../../server/auth/session";
import { comparisonSource } from "../../server/data-source/price-comparison-factory";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requirePageSession();
  let source: ReturnType<typeof comparisonSource>;
  try { source = comparisonSource(); }
  catch {
    return <main className="page-shell"><h1>Comparação de preços</h1><p role="alert">A configuração da fonte de dados está indisponível.</p><Link href="/">Voltar para fila</Link></main>;
  }
  if (source === "operator-api") notFound();
  return <PriceComparisonWorkspace source={source} />;
}
