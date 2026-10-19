import { localize, useI18n } from "@/lib/i18n";
import { guardWorkspace } from "@/lib/workspace-access";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/app/common";
import { InsightCard } from "@/components/app/widgets";
import { RefreshInsightsButton } from "@/components/app/RefreshInsightsButton";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/insights")({
  beforeLoad: guardWorkspace,
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, 
    { title: "AI Insights — CampusPulse AI" }, { name: "description", content: "Proactive, structured recommendations about workload, deadlines and study preparation." },
    { property: "og:title", content: "AI Insights — CampusPulse AI" }, { property: "og:description", content: "Proactive, structured recommendations from CampusPulse." },
  ] }),
  component: Insights,
});

const tabs = ["New", "Accepted", "Applied", "Snoozed", "Dismissed", "All"] as const;

function Insights() {
  const { locale } = useI18n();
  const { insights, backendConnected, agentEnabled } = useStore();
  const [tab, setTab] = useState<(typeof tabs)[number]>("New");
  const list = insights.filter((i) => tab === "All" || i.status === tab);
  return (
    <>
      <PageHeader title={localize("AI Insights", locale)} subtitle={localize("Proactive recommendations prepared by CampusPulse. Predictions are marked with confidence scores.", locale)} actions={<RefreshInsightsButton />} />
      <div className="-mt-2 mb-3 flex overflow-x-auto gap-1 border-b">
        {localize(tabs.map((t) => (
          <Button variant="ghost" size="sm" aria-pressed={tab === t} key={t} onClick={() => setTab(t)} className={cn("-mb-px border-b-2 shrink-0 px-2 py-2 text-[13px]", tab === t ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {localize(t, locale)} <span className="text-[11.5px] text-muted-foreground">{localize(t === "All" ? insights.length : insights.filter((i) => i.status === t).length, locale)}</span>
          </Button>
        )), locale)}
      </div>
      <p className="mb-3 text-[12px] text-muted-foreground">
        <b className="font-medium text-foreground">{localize("New", locale)}</b> {localize("just suggested", locale)} · <b className="font-medium text-foreground">{localize("Accepted", locale)}</b> {localize("you agreed, nothing has changed yet", locale)} · <b className="font-medium text-foreground">{localize("Applied", locale)}</b> {localize("the change was made, for example the session was added to your calendar", locale)}
      </p>
      {localize(list.length ? <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">{localize(list.map((i) => <InsightCard key={i.id} insight={i} />), locale)}</div>
        : <div className="panel"><EmptyState icon={Sparkles} title={localize("Nothing here", locale)} text={localize(backendConnected && agentEnabled ? "Use “Review my week” and the agent will look at your deadlines, workload and free time." : "CampusPulse will surface new insights as your workspace changes.", locale)} /></div>, locale)}
    </>
  );
}
