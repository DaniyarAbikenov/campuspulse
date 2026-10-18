import { createFileRoute } from "@tanstack/react-router";
import { Bot, Cpu, Database, ShieldCheck } from "lucide-react";
import { MetricCard, PageHeader, Panel } from "@/components/app/common";
import { ActivityFeed } from "@/components/app/widgets";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/activity")({
  head: () => ({ meta: [
    { title: "Agent Activity — CampusPulse AI" }, { name: "description", content: "A transparent log of everything the CampusPulse agent did in your workspace." },
    { property: "og:title", content: "Agent Activity — CampusPulse AI" }, { property: "og:description", content: "A transparent log of the CampusPulse agent's actions." },
  ] }),
  component: ActivityPage,
});

function ActivityPage() {
  const { activity } = useStore();
  return (
    <>
      <PageHeader title="Agent Activity" subtitle="Every action the CampusPulse agent took in your workspace (simulated)." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Actions today" value={String(activity.length)} sub="Since 07:30" icon={Bot} />
        <MetricCard label="Documents indexed" value="8" sub="243 pages" icon={Database} />
        <MetricCard label="Background jobs" value="3" sub="Timetable, LMS, forecast" icon={Cpu} />
        <MetricCard label="Permissions" value="Read-only" sub="No submissions on your behalf" icon={ShieldCheck} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Timeline"><ActivityFeed items={activity} /></Panel>
        <Panel title="Scheduled jobs" className="h-fit">
          {[["Timetable sync", "Every day · 07:30", "Healthy"], ["LMS assignment scan", "Every 2 hours", "Healthy"], ["Workload forecast", "On change", "Healthy"], ["Event matching", "Daily · 18:00", "Paused"]].map(([n, s, st]) => (
            <div key={n} className="flex items-center justify-between border-b py-2 text-[12.5px] last:border-0"><div><div className="font-medium">{n}</div><div className="text-[11.5px] text-muted-foreground">{s}</div></div><span className={st === "Healthy" ? "text-success" : "text-warning"}>{st}</span></div>
          ))}
        </Panel>
      </div>
    </>
  );
}
