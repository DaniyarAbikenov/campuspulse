import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/app/common";
import { InsightCard } from "@/components/app/widgets";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/insights")({
  head: () => ({ meta: [
    { title: "AI Insights — CampusPulse AI" }, { name: "description", content: "Proactive, structured recommendations about workload, deadlines and study preparation." },
    { property: "og:title", content: "AI Insights — CampusPulse AI" }, { property: "og:description", content: "Proactive, structured recommendations from CampusPulse." },
  ] }),
  component: Insights,
});

const tabs = ["New", "Accepted", "Snoozed", "Dismissed", "All"] as const;

function Insights() {
  const { insights } = useStore();
  const [tab, setTab] = useState<(typeof tabs)[number]>("New");
  const list = insights.filter((i) => tab === "All" || i.status === tab);
  return (
    <>
      <PageHeader title="AI Insights" subtitle="Proactive recommendations prepared by CampusPulse. Predictions are marked with confidence scores." />
      <div className="-mt-2 mb-3 flex gap-1 border-b">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("-mb-px border-b-2 px-3 py-2 text-[13px]", tab === t ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t} <span className="text-[11.5px] text-muted-foreground">{t === "All" ? insights.length : insights.filter((i) => i.status === t).length}</span>
          </button>
        ))}
      </div>
      {list.length ? <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">{list.map((i) => <InsightCard key={i.id} insight={i} />)}</div>
        : <div className="panel"><EmptyState icon={Sparkles} title="Nothing here" text="CampusPulse will surface new insights as your workspace changes." /></div>}
    </>
  );
}
