import { useState } from "react";
import { AlertTriangle, CheckCircle2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  applyTaskPlan,
  dismissTaskPlan,
  updatePlanItem,
  type AgentStep,
  type PlanTask,
  type TaskPlan,
  errorText,
} from "@/lib/api";
import { localize, useI18n } from "@/lib/i18n";
import { StudyMaterial } from "@/components/app/StudyMaterial";
import { AgentTrace } from "@/components/app/AgentTrace";
import { traceOf } from "@/lib/agentSteps";

const hoursLabel = (value: number) => `${Math.round(value * 100) / 100}h`;

/** Review step for a task plan the agent proposed: edit, drop tasks, then approve explicitly. */
export function TaskPlanReview({
  initial,
  steps,
  onApplied,
  onDismissed,
}: {
  initial: TaskPlan;
  steps: AgentStep[];
  onApplied: (created: number) => void;
  onDismissed: () => void;
}) {
  const { locale } = useI18n();
  const [plan, setPlan] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = plan.items.filter((item) => item.selected);
  const total = chosen.reduce((sum, item) => sum + item.estimatedHours, 0);
  const unverified = plan.items.filter((item) => item.selected && !item.quoteVerified).length;
  const requirements = [...new Map(plan.items.map((item) => [item.requirementId, item])).values()];

  const change = (item: PlanTask, values: Partial<PlanTask>) => {
    setPlan((current) => ({
      ...current,
      items: current.items.map((row) => (row.id === item.id ? { ...row, ...values } : row)),
    }));
    void updatePlanItem(plan.id, item.id, {
      ...(values.selected === undefined ? {} : { selected: values.selected }),
      ...(values.estimatedHours === undefined ? {} : { estimatedHours: values.estimatedHours }),
    }).catch((cause: unknown) => setError(errorText(cause)));
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 text-[13px]">
      {plan.summary ? <p className="text-muted-foreground">{plan.summary}</p> : null}
      {plan.relatedTitle ? (
        <div className="flex items-center gap-2 rounded-md border border-info/30 bg-info-soft px-3 py-2">
          <Link2 className="h-3.5 w-3.5 text-info" aria-hidden />
          <span>
            {localize(plan.relation === "depends_on" ? "Depends on" : "Extends", locale)}{" "}
            <strong>{plan.relatedTitle}</strong>
          </span>
        </div>
      ) : null}
      <div className="rounded-md border p-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium">
          <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden />
          {requirements.length} {localize("requirements extracted from the document", locale)}
        </div>
        <ul className="grid gap-x-4 gap-y-0.5 text-[12px] text-muted-foreground sm:grid-cols-2">
          {requirements.map((item) => (
            <li key={item.requirementId}>
              <span className="font-medium text-foreground">{item.requirementId}</span>{" "}
              {item.requirementText}
            </li>
          ))}
        </ul>
      </div>
      <div className="max-h-[38vh] overflow-y-auto rounded-md border">
        <div className="sticky top-0 border-b bg-card px-3 py-2 text-[12px] font-medium">
          {plan.items.length} {localize("proposed tasks", locale)} · {hoursLabel(total)}
        </div>
        <ul>
          {plan.items.map((item) => (
            <li key={item.id} className="border-b px-3 py-2 last:border-0">
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  aria-label={item.title}
                  checked={item.selected}
                  onChange={(event) => change(item, { selected: event.target.checked })}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{item.title}</div>
                  {item.description ? (
                    <div className="text-[12px] text-muted-foreground">{item.description}</div>
                  ) : null}
                  <div className="mt-1 text-[11.5px] text-muted-foreground">
                    <span className="font-medium text-foreground">{item.requirementId}</span> ·{" "}
                    {localize("page", locale)} {item.page} · “{item.quote}”
                    {!item.quoteVerified ? (
                      <span className="ml-1 inline-flex items-center gap-0.5 text-warning">
                        <AlertTriangle className="h-3 w-3" aria-hidden />
                        {localize("quote not found in the document", locale)}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1.5"><StudyMaterial resources={item.resources} /></div>
                </div>
                <label className="flex shrink-0 items-center gap-1 text-[12px]">
                  <input
                    type="number"
                    min={0.25}
                    step={0.25}
                    aria-label={`${localize("Estimate (h)", locale)}: ${item.title}`}
                    className="w-16 rounded-md border bg-background px-1.5 py-1 tabular-nums"
                    value={item.estimatedHours}
                    disabled={!item.selected}
                    onChange={(event) => {
                      const hours = Number(event.target.value);
                      if (Number.isFinite(hours) && hours > 0)
                        change(item, { estimatedHours: hours });
                    }}
                  />
                  h
                </label>
              </div>
            </li>
          ))}
        </ul>
      </div>
      {steps.length ? (
        <details className="rounded-md border bg-secondary/40 px-3 py-1.5 text-[12px] text-muted-foreground">
          <summary className="cursor-pointer">{localize("How the agent got here", locale)}</summary>
          <AgentTrace items={traceOf(steps)} className="mt-1.5" />
        </details>
      ) : null}
      <p className="rounded-md border-l-2 border-ai bg-ai-soft/60 px-3 py-2 text-[12px]">
        {localize(
          "Generated by the CampusPulse agent from your document, not yet imported. Nothing is added to the Kanban board until you approve.",
          locale,
        )}
      </p>
      {unverified ? (
        <p role="status" className="text-[12px] text-warning">
          {unverified}{" "}
          {localize(
            "selected tasks cite text that could not be found in the document. Check them before approving.",
            locale,
          )}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="break-words text-[12px] text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await dismissTaskPlan(plan.id);
              onDismissed();
            })
          }
        >
          {localize("Discard plan", locale)}
        </Button>
        <Button
          disabled={busy || !chosen.length}
          onClick={() =>
            void run(async () => {
              const result = await applyTaskPlan(plan.id);
              onApplied(result.created);
            })
          }
        >
          {localize("Approve and add to Kanban", locale)} ({chosen.length})
        </Button>
      </div>
    </div>
  );
}
