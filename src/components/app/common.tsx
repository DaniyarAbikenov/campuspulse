import { localize, useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Sparkles, ArrowUpRight, ArrowDownRight, type LucideIcon, FileText } from "lucide-react";
import type { Priority, Status } from "@/lib/data";
import { courseOf } from "@/lib/data";
import { canonicalStatus, statusLabel } from "@/lib/i18n";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  const { locale } = useI18n();
  return (
    <div className="page-header mb-4 grid grid-cols-1 items-end sm:flex sm:flex-wrap sm:justify-between gap-3 border-b pb-3">
      <div className="min-w-0">
        <h1 className="text-[18px] font-semibold leading-tight tracking-[-0.015em]">{localize(title, locale)}</h1>
        {localize(subtitle && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{localize(subtitle, locale)}</p>, locale)}
      </div>
      {localize(actions && <div className="flex min-w-0 flex-wrap items-center gap-2">{localize(actions, locale)}</div>, locale)}
    </div>
  );
}

export function Panel({ title, subtitle, action, children, className, bodyClass, ai }: { title?: ReactNode; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string; bodyClass?: string; ai?: boolean }) {
  const { locale } = useI18n();
  return (
    <section className={cn(ai ? "ai-surface" : "panel", "min-w-0", className)}>
      {localize(title && (
        <header className="panel-header grid min-h-[42px] grid-cols-[minmax(0,1fr)_auto] items-center sm:flex sm:justify-between gap-2 border-b px-3.5 py-2">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold leading-tight">{localize(title, locale)}{localize(ai && <AIBadge label={localize("AI", locale)} />, locale)}</h2>
            {localize(subtitle && <p className="mt-0.5 text-[11.5px] leading-tight text-muted-foreground">{localize(subtitle, locale)}</p>, locale)}
          </div>
          {localize(action && <div className="panel-actions min-w-0 shrink-0">{localize(action, locale)}</div>, locale)}
        </header>
      ), locale)}
      <div className={cn("min-w-0 overflow-x-auto p-3.5", bodyClass)}>{localize(children, locale)}</div>
    </section>
  );
}

export function MetricCard({ label, value, sub, icon: Icon, trend, tone = "default" }: { label: string; value: string; sub: string; icon: LucideIcon; trend?: { dir: "up" | "down"; text: string; good?: boolean }; tone?: "default" | "warning" }) {
  const { locale } = useI18n();
  return (
    <div className={cn("panel relative overflow-hidden px-3.5 py-3", tone === "warning" && "before:absolute before:inset-x-0 before:top-0 before:h-[2px] before:bg-warning")}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1">
        <span className="eyebrow">{localize(label, locale)}</span>
        <Icon className={cn("h-3.5 w-3.5 text-muted-foreground", tone === "warning" && "text-warning")} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
        <span className="text-[22px] font-semibold leading-none tracking-[-0.02em] tabular-nums">{localize(value, locale)}</span>
        {localize(trend && (
          <span className={cn("inline-flex items-center text-[11px] font-medium", trend.good ? "text-success" : "text-destructive")}>
            {localize(trend.dir === "up" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />, locale)}
            {localize(trend.text, locale)}
          </span>
        ), locale)}
      </div>
      <p className="mt-1.5 truncate text-[11.5px] text-muted-foreground">{localize(sub, locale)}</p>
    </div>
  );
}

const statusStyles: Record<string, string> = {
  "To Do": "bg-secondary text-muted-foreground border-border",
  "In Progress": "bg-info-soft text-info border-info/20",
  Review: "bg-warning-soft text-warning border-warning/20",
  Completed: "bg-success-soft text-success border-success/20",
  Upcoming: "bg-secondary text-muted-foreground border-border",
  Cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  New: "bg-primary-soft text-primary border-primary/20",
  Applied: "bg-info-soft text-info border-info/20",
  Accepted: "bg-success-soft text-success border-success/20",
  Dismissed: "bg-secondary text-muted-foreground border-border",
  Snoozed: "bg-warning-soft text-warning border-warning/20",
};

export function StatusBadge({ status }: { status: Status | string }) {
  const { locale } = useI18n();
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded border px-1.5 py-px text-[10.5px] font-medium leading-4", statusStyles[canonicalStatus(status)] ?? statusStyles["To Do"])}>{localize(statusLabel(status, locale), locale)}</span>;
}

export function PriorityIndicator({ priority }: { priority: Priority }) {
  const { locale } = useI18n();
  const bars = priority === "High" ? 3 : priority === "Medium" ? 2 : 1;
  const color = priority === "High" ? "bg-destructive" : priority === "Medium" ? "bg-warning" : "bg-muted-foreground";
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className="flex items-end gap-[2px]">
        {localize([1, 2, 3].map((b) => <span key={b} className={cn("w-[3px] rounded-sm", b <= bars ? color : "bg-border")} style={{ height: 4 + b * 3 }} />), locale)}
      </span>
      {localize(priority, locale)}
    </span>
  );
}

export function AIBadge({ label = "AI" }: { label?: string }) {
  const { locale } = useI18n();
  return <span className="inline-flex items-center gap-1 rounded border border-ai/20 bg-ai-soft px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-ai"><Sparkles className="h-2.5 w-2.5" />{localize(label, locale)}</span>;
}

export function SourceReference({ file, page, onClick }: { file: string; page?: number; onClick?: () => void }) {
  const { locale } = useI18n();
  return (
    <Button variant="outline" size="sm" onClick={onClick} className="inline-flex items-center gap-1 rounded border bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">
      <FileText className="h-3 w-3" />{localize(file, locale)}{localize(page ? `, p. ${page}` : "", locale)}
    </Button>
  );
}

export function CourseTag({ id }: { id: string }) {
  const { locale } = useI18n();
  const c = courseOf(id);
  return <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground"><span className={cn("h-2 w-2 rounded-full", c.color)} />{localize(c.name, locale)}</span>;
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const { locale } = useI18n();
  return (
    <div className={cn("h-1 w-full overflow-hidden rounded-full bg-secondary", className)}>
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${value}%` }} />
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  const { locale } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="mb-3 rounded-lg border bg-secondary p-2.5"><Icon className="h-5 w-5 text-muted-foreground" /></div>
      <p className="text-[13px] font-medium">{localize(title, locale)}</p>
      <p className="mt-1 max-w-xs text-[12px] text-muted-foreground">{localize(text, locale)}</p>
    </div>
  );
}

export function PredictionNote({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  return (
    <div className="flex gap-2 rounded-md border-l-2 border-ai bg-ai-soft px-2.5 py-1.5 text-[12px] leading-relaxed">
      <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-ai" />
      <div><span className="mr-1 font-semibold text-ai">{localize("AI", locale)}</span>{localize(children, locale)}</div>
    </div>
  );
}
