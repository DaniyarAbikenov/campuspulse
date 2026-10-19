import { useCallback, useEffect, useRef, useState } from "react";
import { DownloadCloud, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  applyImportProposal,
  dismissImportProposal,
  fetchImportProposals,
  updateImportItem,
  type ImportItem,
  type ImportProposal,
} from "@/lib/api";
import { localize, useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

const dueLabel = (value: string) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "Asia/Almaty" }).format(
    new Date(value),
  );

/** Review step for assignments found in an external system; nothing is created until approval. */
export function ImportProposals() {
  const { locale } = useI18n();
  const { backendConnected, courses, reloadWorkspace } = useStore();
  const [proposals, setProposals] = useState<ImportProposal[]>([]);
  const [open, setOpen] = useState<ImportProposal | null>(null);
  const [busy, setBusy] = useState(false);
  // Edits are saved in order and applying waits for them, so approval never races a pending change.
  const saves = useRef<Promise<void>>(Promise.resolve());
  const linkable = courses.filter((course) => course.backendId);

  const refresh = useCallback(async () => {
    try {
      setProposals(await fetchImportProposals());
    } catch (error) {
      console.warn("Import proposals unavailable", error);
    }
  }, []);
  useEffect(() => {
    if (backendConnected) void refresh();
  }, [backendConnected, refresh]);

  if (!proposals.length) return null;
  const pending = proposals.reduce((sum, proposal) => sum + proposal.items.length, 0);

  const edit = (proposal: ImportProposal, item: ImportItem, values: Partial<ImportItem>) => {
    const next = { ...item, ...values };
    const patch = {
      selected: next.selected,
      ...(next.courseId ? { courseId: next.courseId } : {}),
      estimatedHours: next.estimatedHours,
    };
    const update = (current: ImportProposal) => ({
      ...current,
      items: current.items.map((row) => (row.id === item.id ? next : row)),
    });
    setOpen((current) => (current ? update(current) : current));
    setProposals((all) => all.map((row) => (row.id === proposal.id ? update(row) : row)));
    saves.current = saves.current.then(() =>
      updateImportItem(proposal.id, item.id, patch)
        .then(() => undefined)
        .catch((error: unknown) => {
          toast.error("Change was not saved", { description: String(error) });
          void refresh();
        }),
    );
  };

  const apply = async (proposal: ImportProposal) => {
    setBusy(true);
    try {
      await saves.current;
      const result = await applyImportProposal(proposal.id);
      await reloadWorkspace();
      await refresh();
      setOpen(null);
      toast.success(localize("Assignments imported", locale), {
        description: `${result.created} ${localize("created", locale)}`,
      });
    } catch (error) {
      toast.error("Import failed", { description: String(error) });
    } finally {
      setBusy(false);
    }
  };

  const dismiss = async (proposal: ImportProposal) => {
    setBusy(true);
    try {
      await dismissImportProposal(proposal.id);
      await refresh();
      setOpen(null);
    } catch (error) {
      toast.error("Could not dismiss", { description: String(error) });
    } finally {
      setBusy(false);
    }
  };

  const chosen = open?.items.filter((item) => item.selected) ?? [];
  const blocked = chosen.some((item) => !item.courseId);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-ai/30 bg-ai-soft/60 px-3 py-2 text-[13px]">
        <DownloadCloud className="h-4 w-4 text-ai" aria-hidden />
        <span className="min-w-0 flex-1">
          {pending} {localize("assignments found in", locale)} {proposals[0]?.source === "moodle" ? "Moodle" : proposals[0]?.source}
          {". "}
          {localize("Nothing is added until you approve.", locale)}
        </span>
        <Button size="sm" onClick={() => setOpen(proposals[0] ?? null)}>
          {localize("Review import", locale)}
        </Button>
      </div>
      <Dialog open={!!open} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{localize("Import assignments", locale)}</DialogTitle>
            <DialogDescription>
              {localize("Choose the course and a time estimate for each assignment. Moodle does not provide estimates, so the default is only a starting point.", locale)}
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-[55vh] space-y-3 overflow-y-auto">
            {open?.items.map((item) => (
              <li key={item.id} className="rounded-md border p-3 text-[13px]">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={item.selected}
                    onChange={(event) => edit(open, item, { selected: event.target.checked })}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{item.title}</span>
                    <span className="block text-[11.5px] text-muted-foreground">
                      {item.courseName} · {localize("due", locale)} {localize(dueLabel(item.dueAt), locale)}
                    </span>
                  </span>
                </label>
                {item.description ? (
                  <p className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">{item.description}</p>
                ) : null}
                {item.attachments.length ? (
                  <p className="mt-1 flex items-center gap-1 text-[11.5px] text-muted-foreground">
                    <Paperclip className="h-3 w-3" aria-hidden />
                    {item.attachments.join(", ")}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1.5 text-[12px]">
                    {localize("Course", locale)}
                    <select
                      className="rounded-md border bg-background px-2 py-1"
                      value={item.courseId ?? ""}
                      disabled={!item.selected}
                      onChange={(event) => edit(open, item, { courseId: event.target.value || null })}
                    >
                      <option value="">{localize("Choose…", locale)}</option>
                      {linkable.map((course) => (
                        <option key={course.id} value={course.backendId}>
                          {course.code} · {course.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5 text-[12px]">
                    {localize("Estimate (h)", locale)}
                    <input
                      type="number"
                      min={0.5}
                      step={0.5}
                      className="w-20 rounded-md border bg-background px-2 py-1"
                      value={item.estimatedHours}
                      disabled={!item.selected}
                      onChange={(event) => {
                        const hours = Number(event.target.value);
                        if (Number.isFinite(hours) && hours >= 0) edit(open, item, { estimatedHours: hours });
                      }}
                    />
                  </label>
                </div>
              </li>
            ))}
          </ul>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={busy} onClick={() => open && void dismiss(open)}>
              {localize("Dismiss", locale)}
            </Button>
            <Button disabled={busy || !chosen.length || blocked} onClick={() => open && void apply(open)}>
              {localize("Import selected", locale)} ({chosen.length})
            </Button>
          </DialogFooter>
          {blocked ? (
            <p role="status" className="text-[12px] text-warning">
              {localize("Choose a course for every selected assignment.", locale)}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
