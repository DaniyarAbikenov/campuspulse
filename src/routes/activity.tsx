import { localize, useI18n } from "@/lib/i18n";
import { guardWorkspace } from "@/lib/workspace-access";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { Bot, Cpu, Database, ShieldCheck } from "lucide-react";
import { MetricCard, PageHeader, Panel } from "@/components/app/common";
import { ActivityFeed } from "@/components/app/widgets";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/activity")({
  beforeLoad: guardWorkspace,
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, 
    { title: "Agent Activity — CampusPulse AI" }, { name: "description", content: "A transparent log of everything the CampusPulse agent did in your workspace." },
    { property: "og:title", content: "Agent Activity — CampusPulse AI" }, { property: "og:description", content: "A transparent log of the CampusPulse agent's actions." },
  ] }),
  component: ActivityPage,
});

function ActivityPage() {
  const { locale } = useI18n();
  const { activity: studentActivity, role, knowledgeDocs, adminFeed, adminOverview, backendConnected, loadAdminOverview } = useStore();
  useEffect(() => { if (backendConnected && role === "admin") void loadAdminOverview(); }, [backendConnected, role, loadAdminOverview]);
  const documentTotals = { count: knowledgeDocs.length, pages: knowledgeDocs.reduce((sum, item) => sum + item.pages, 0) };
  const activity = role === "admin" ? adminFeed : studentActivity;
  return (
    <>
      <PageHeader title={localize("Agent Activity", locale)} subtitle={localize(role === "admin" ? "Anonymised counts of what happened in the last 7 days. No student is identified." : backendConnected ? "Every action the CampusPulse agent took in your workspace, with the tools it called." : "Every action the CampusPulse agent took in your workspace (simulated).", locale)} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label={localize(role === "admin" ? "Activity types" : "Agent runs", locale)} value={String(activity.length)} sub={localize(role === "admin" ? "Last 7 days" : "Most recent", locale)} icon={Bot} />
        {localize(role === "student" ? <MetricCard label={localize("Documents indexed", locale)} value={String(documentTotals.count)} sub={localize(`${documentTotals.pages} pages`, locale)} icon={Database} /> : <MetricCard label={localize("Faculty courses", locale)} value={String(adminOverview?.courseCount ?? adminFeed.length)} sub={localize("Anonymised aggregates", locale)} icon={Database} />, locale)}
        <MetricCard label={localize("Tool calls", locale)} value={String(activity.reduce((sum, item) => sum + (item.tools?.length ?? 0), 0))} sub={localize("Across these runs", locale)} icon={Cpu} />
        <MetricCard label={localize("Permissions", locale)} value="Read-only" sub={localize("No submissions on your behalf", locale)} icon={ShieldCheck} />
      </div>
      <div className="mt-4">
        <Panel title={localize("Timeline", locale)}><ActivityFeed items={activity} technical={role === "student"} /></Panel>

      </div>
    </>
  );
}
