import { AlertTriangle, Brain, CheckCircle2, Loader2 } from "lucide-react";
import { collapseTrace, type TraceItem } from "@/lib/agentSteps";
import { localize, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** The agent's work as it happens: each tool call, its outcome and the thoughts between. */
export function AgentTrace({
  items,
  live = false,
  className,
}: {
  items: TraceItem[];
  live?: boolean;
  className?: string;
}) {
  const { locale } = useI18n();
  const lines = collapseTrace(items);
  const busy = live && lines.every((item) => item.status !== "running");
  return (
    <ol
      aria-label={localize("Agent steps", locale)}
      className={cn("space-y-1.5 text-[12px]", className)}
    >
      {lines.map((item) => (
        <li key={item.id} className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0" aria-hidden>
            {item.kind === "thought" ? (
              <Brain className="h-3.5 w-3.5 text-ai" />
            ) : item.status === "running" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            ) : item.status === "error" ? (
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div
              className={cn(item.status === "running" ? "font-medium" : "text-muted-foreground")}
            >
              {item.kind === "thought" ? item.label : localize(item.label, locale)}
              {item.status === "running" ? "…" : ""}
              {item.repeat && item.repeat > 1 ? <span className="ml-1 text-[11px]">×{item.repeat}</span> : null}
            </div>
          </div>
        </li>
      ))}
      {busy ? (
        <li className="flex items-center gap-2 text-muted-foreground" role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          {localize(lines.length ? "Thinking…" : "Connecting to the agent…", locale)}
        </li>
      ) : null}
    </ol>
  );
}
