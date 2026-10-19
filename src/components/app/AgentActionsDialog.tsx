import { useEffect, useState } from "react";
import { CalendarPlus, CheckCircle2, ListPlus, ListChecks, Loader2, Ban } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { applyAgentAction, campusInputs, dismissAgentAction, type AgentAction } from "@/lib/api";
import { localize, useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

const ICONS: Record<string, typeof CalendarPlus> = {
  create_study_session: CalendarPlus,
  create_calendar_activity: CalendarPlus,
  create_task: ListPlus,
  update_task_status: ListChecks,
  cancel_assignment: Ban,
};

/** What exactly will change, in words the student can check before confirming. */
export function describeAction(
  action: AgentAction,
  taskTitle?: (id: string) => string | undefined,
): string {
  const p = action.payload;
  const when = (): string => {
    if (typeof p["starts_at"] !== "string" || typeof p["ends_at"] !== "string") return "";
    const from = campusInputs(p["starts_at"]);
    return `${from.date} ${from.time}–${campusInputs(p["ends_at"]).time}`;
  };
  switch (action.kind) {
    case "create_study_session":
    case "create_calendar_activity":
      return `${when()}${typeof p["location"] === "string" ? ` · ${p["location"]}` : ""}`;
    case "create_task":
      return `${String(p["title"] ?? "")} · ${String(p["estimated_hours"] ?? "")}h`;
    case "update_task_status":
      return `${taskTitle?.(String(p["task_id"])) ?? "Task"} → ${String(p["status"] ?? "")}`;
    default:
      return "Unfinished tasks and future study sessions of this assignment will be removed.";
  }
}

type Outcome = "applied" | "dismissed" | string;

/** The agent only proposes; each change here happens when the student presses Apply. */
export function AgentActionsDialog({
  actions,
  open,
  onOpenChange,
}: {
  actions: AgentAction[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { locale } = useI18n();
  const { tasks, reloadWorkspace } = useStore();
  const [outcome, setOutcome] = useState<Record<string, Outcome>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (open) setOutcome({});
  }, [open, actions]);

  const taskTitle = (id: string) => tasks.find((item) => item.id === id)?.title;
  const apply = async (action: AgentAction) => {
    setBusy(action.id);
    try {
      const result = await applyAgentAction(action.id);
      setOutcome((current) => ({ ...current, [action.id]: "applied" }));
      toast.success(localize(result.detail, locale));
      await reloadWorkspace();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setOutcome((current) => ({ ...current, [action.id]: message }));
    } finally {
      setBusy(null);
    }
  };
  const dismiss = async (action: AgentAction) => {
    setBusy(action.id);
    try {
      await dismissAgentAction(action.id);
      setOutcome((current) => ({ ...current, [action.id]: "dismissed" }));
    } finally {
      setBusy(null);
    }
  };

  const single = actions.length === 1 ? actions[0] : undefined;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[16px]">
            {single
              ? `${localize("Apply", locale)}: ${single.title}`
              : localize("The assistant proposes these changes", locale)}
          </DialogTitle>
          <DialogDescription>
            {localize("Nothing changes until you press Apply.", locale)}
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {actions.map((action) => {
            const Icon = ICONS[action.kind] ?? ListChecks;
            const result = outcome[action.id];
            const failed = result && result !== "applied" && result !== "dismissed";
            return (
              <li key={action.id} className="rounded-md border p-3 text-[13px]">
                <div className="flex items-start gap-2">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ai" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{action.title}</div>
                    {action.summary ? (
                      <p className="text-[12px] text-muted-foreground">{action.summary}</p>
                    ) : null}
                    <p className="mt-1 text-[12px] tabular-nums">
                      {localize(describeAction(action, taskTitle), locale)}
                    </p>
                    {failed ? (
                      <p role="alert" className="mt-1 break-words text-[12px] text-destructive">
                        {result}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-end gap-2">
                  {result === "applied" ? (
                    <span className="flex items-center gap-1 text-[12px] text-success">
                      <CheckCircle2 className="h-3.5 w-3.5" /> {localize("Applied", locale)}
                    </span>
                  ) : result === "dismissed" ? (
                    <span className="text-[12px] text-muted-foreground">
                      {localize("Dismissed", locale)}
                    </span>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy !== null}
                        onClick={() => void dismiss(action)}
                      >
                        {localize("Dismiss", locale)}
                      </Button>
                      <Button size="sm" disabled={busy !== null} onClick={() => void apply(action)}>
                        {busy === action.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        {`${localize("Apply", locale)} ${single ? "" : action.title}`.trim()}
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
