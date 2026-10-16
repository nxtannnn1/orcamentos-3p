import { notFound } from "next/navigation";
import { isDemoEnabled } from "../../demo/configuration";
import { DemoWorkspace } from "../../components/demo-workspace";

export const dynamic = "force-dynamic";
export default function DemoPage() {
  if (!isDemoEnabled()) notFound();
  return <DemoWorkspace />;
}
