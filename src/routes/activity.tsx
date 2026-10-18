import { localize, useI18n } from "@/lib/i18n";
import { guardWorkspace } from "@/lib/workspace-access";
import { createFileRoute } from "@tanstack/react-router";
import { Bot, Cpu, Database, ShieldCheck } from "lucide-react";
import { MetricCard, PageHeader, Panel } from "@/components/app/common";
import { ActivityFeed } from "@/components/app/widgets";
import { documentTotals, adminActivity, facultySummary } from "@/lib/data";
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
  const { activity: studentActivity, role } = useStore();
  const activity = role === "admin" ? adminActivity : studentActivity;
  return (
    <>
      <PageHeader title={localize("Agent Activity", locale)} subtitle={localize("Every action the CampusPulse agent took in your workspace (simulated).", locale)} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label={localize("Actions today", locale)} value={String(activity.length)} sub={localize("Since 07:30", locale)} icon={Bot} />
        {localize(role === "student" ? <MetricCard label={localize("Documents indexed", locale)} value={String(documentTotals.count)} sub={localize(`${documentTotals.pages} pages`, locale)} icon={Database} /> : <MetricCard label={localize("Faculty courses", locale)} value={String(facultySummary.courses)} sub={localize("Anonymised faculty sample", locale)} icon={Database} />, locale)}
        <MetricCard label={localize("Background jobs", locale)} value="3" sub={localize("Timetable, LMS, forecast", locale)} icon={Cpu} />
        <MetricCard label={localize("Permissions", locale)} value="Read-only" sub={localize("No submissions on your behalf", locale)} icon={ShieldCheck} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Panel title={localize("Timeline", locale)}><ActivityFeed items={activity} /></Panel>
        <Panel title={localize("Scheduled jobs", locale)} className="h-fit">
          {localize([["Timetable sync", "Every day · 07:30", "Healthy"], ["LMS assignment scan", "Every 2 hours", "Healthy"], ["Workload forecast", "On change", "Healthy"], ["Event matching", "Daily · 18:00", "Paused"]].map(([n, s, st]) => (
            <div key={n} className="flex items-center justify-between border-b py-2 text-[12.5px] last:border-0"><div><div className="font-medium">{localize(n, locale)}</div><div className="text-[11.5px] text-muted-foreground">{localize(s, locale)}</div></div><span className={st === "Healthy" ? "text-success" : "text-warning"}>{localize(st, locale)}</span></div>
          )), locale)}
        </Panel>
      </div>
    </>
  );
}
