import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CalendarPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/app/common";
import { applyStudyPlan, campusClockText, campusTime, fetchStudyPlan, type StudyPlan } from "@/lib/api";
import { localize, useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

const dayLabel = (value: string) =>
  new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(campusTime(value));

/** Preview and apply: study sessions the backend would place into free time, earliest deadline first. */
export function StudyPlanPanel() {
  const { locale } = useI18n();
  const { reloadWorkspace } = useStore();
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setPlan(await fetchStudyPlan());
      setError(null);
    } catch (cause) {
      setError(String(cause));
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const apply = async () => {
    setBusy(true);
    try {
      const result = await applyStudyPlan();
      await reloadWorkspace();
      setPlan(result.plan);
      toast.success(localize("Study plan applied", locale), { description: `${result.created} ${localize("study sessions added to your calendar", locale)}` });
    } catch (cause) {
      toast.error(localize("Could not apply the plan", locale), { description: String(cause) });
    } finally {
      setBusy(false);
    }
  };

  const days = plan ? [...new Set(plan.sessions.map((item) => dayLabel(item.startsAt)))] : [];
  return (
    <Panel title={localize("Study plan", locale)} subtitle={localize("Unscheduled tasks placed into your free time, earliest deadline first", locale)}>
      {error ? <p role="alert" className="break-words text-[12px] text-destructive">{error}</p> : null}
      {plan && !plan.sessions.length && !plan.unplaced.length ? (
        <p className="text-[12.5px] text-muted-foreground">{localize("Every open task already has study time, or there are no open tasks to plan.", locale)}</p>
      ) : null}
      {plan?.sessions.length ? (
        <>
          <ul className="max-h-60 space-y-2 overflow-y-auto text-[12.5px]">
            {days.map((day) => (
              <li key={day}>
                <div className="text-[11.5px] font-medium text-muted-foreground">{day}</div>
                {plan.sessions.filter((item) => dayLabel(item.startsAt) === day).map((item) => (
                  <div key={`${item.taskId}-${item.startsAt}`} className="flex justify-between gap-3 border-b py-1 last:border-0">
                    <span className="min-w-0 truncate">{item.taskTitle}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{campusClockText(item.startsAt)}–{campusClockText(item.endsAt)}</span>
                  </div>
                ))}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-muted-foreground">{plan.sessions.length} {localize("sessions", locale)} · {Math.round(plan.placedHours * 100) / 100}{localize("h", locale)}. {localize("This redistributes work into existing free time; it does not add study capacity.", locale)}</p>
          <Button size="sm" className="mt-3" disabled={busy} onClick={() => void apply()}><CalendarPlus className="h-3.5 w-3.5" /> {localize("Add to calendar", locale)}</Button>
        </>
      ) : null}
      {plan?.unplaced.length ? (
        <div className="mt-3 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-[12px]" role="status">
          <div className="flex items-center gap-1.5 font-medium"><AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {Math.round(plan.unplacedHours * 100) / 100}{localize("h cannot fit before the deadlines", locale)}</div>
          <ul className="mt-1 list-disc pl-5">
            {plan.unplaced.map((item) => <li key={item.taskId}>{item.taskTitle} ({item.hours}{localize("h", locale)})</li>)}
          </ul>
          <p className="mt-1 text-muted-foreground">{localize("Free more time, move a deadline or reduce an estimate.", locale)}</p>
        </div>
      ) : null}
    </Panel>
  );
}
