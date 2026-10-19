import { useState } from "react";
import { applyStep, type TraceItem } from "@/lib/agentSteps";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { localize, useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

/** Asks the agent to review deadlines, workload and free time and propose new insights. */
export function RefreshInsightsButton({ variant = "default" }: { variant?: "default" | "outline" }) {
  const { locale } = useI18n();
  const { agentEnabled, backendConnected, refreshInsights, role } = useStore();
  const [busy, setBusy] = useState(false);
  if (!backendConnected || !agentEnabled || role !== "student") return null;
  const run = async () => {
    setBusy(true);
    const id = toast.loading(localize("Connecting to the agent…", locale));
    let trace: TraceItem[] = [];
    try {
      const count = await refreshInsights((step) => {
        trace = applyStep(trace, step);
        const latest = trace[trace.length - 1];
        if (latest) toast.loading(localize(latest.label, locale), { id });
      });
      toast.success(`${count} ${localize("new insights from the agent", locale)}`, { id });
    } catch (error) {
      toast.error(localize("The agent could not review your week", locale), { id, description: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button size="sm" variant={variant} disabled={busy} onClick={() => void run()}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{" "}
      {localize(busy ? "Reviewing your week…" : "Review my week", locale)}
    </Button>
  );
}
