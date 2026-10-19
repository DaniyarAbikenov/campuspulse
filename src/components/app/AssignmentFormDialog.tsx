import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createRemoteAssignment, errorText } from "@/lib/api";
import { localize, useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { addDays } from "@/lib/week";

/** Add an assignment by hand, optionally with its brief (PDF, DOCX or TXT) attached. */
export function AssignmentFormDialog({
  open,
  onOpenChange,
  courseId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fixes the course when opened from a course page. */
  courseId?: string;
}) {
  const { locale } = useI18n();
  const { courses, today, uploadAssignment, reloadWorkspace } = useStore();
  const [course, setCourse] = useState(courseId ?? "");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(addDays(today, 7));
  const [hours, setHours] = useState("2");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset only when the dialog opens, never while it is open: store updates must not wipe what is typed.
  const wasOpen = useRef(false);
  useEffect(() => {
    const justOpened = open && !wasOpen.current;
    wasOpen.current = open;
    if (!justOpened) return;
    setCourse(courseId ?? courses[0]?.id ?? "");
    setTitle("");
    setDue(addDays(today, 7));
    setHours("2");
    setDescription("");
    setFile(null);
  }, [open, courseId, courses, today]);

  const estimate = Number(hours);
  const valid =
    !!course && title.trim().length > 0 && !!due && Number.isFinite(estimate) && estimate >= 0;

  const submit = async () => {
    setBusy(true);
    // End of the due day on the campus clock.
    const dueAt = `${due}T23:59:00+05:00`;
    try {
      if (file) {
        await uploadAssignment({
          file,
          courseId: course,
          title: title.trim(),
          dueAt,
          estimatedHours: estimate,
          ...(description.trim() ? { description: description.trim() } : {}),
        });
      } else {
        const target = courses.find((item) => item.id === course);
        await createRemoteAssignment({
          courseId: target?.backendId ?? course,
          title: title.trim(),
          dueAt,
          estimatedHours: estimate,
          ...(description.trim() ? { description: description.trim() } : {}),
        });
      }
      await reloadWorkspace();
      toast.success(localize("Assignment added", locale));
      onOpenChange(false);
    } catch (error) {
      toast.error(localize("Could not add the assignment", locale), {
        description: errorText(error),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[16px]">{localize("New assignment", locale)}</DialogTitle>
          <DialogDescription>
            {localize(
              "Add it by hand, or attach the brief so the agent can read it later.",
              locale,
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!courseId ? (
            <div className="space-y-1.5">
              <Label htmlFor="asg-course" className="text-[12px]">
                {localize("Course", locale)}
              </Label>
              <Select value={course} onValueChange={setCourse}>
                <SelectTrigger id="asg-course">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="asg-title" className="text-[12px]">
              {localize("Title", locale)}
            </Label>
            <Input
              id="asg-title"
              value={title}
              maxLength={240}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="asg-due" className="text-[12px]">
                {localize("Deadline", locale)}
              </Label>
              <Input
                id="asg-due"
                type="date"
                value={due}
                onChange={(event) => setDue(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="asg-hours" className="text-[12px]">
                {localize("Estimate (h)", locale)}
              </Label>
              <Input
                id="asg-hours"
                type="number"
                min={0}
                step={0.25}
                value={hours}
                onChange={(event) => setHours(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="asg-description" className="text-[12px]">
              {localize("Description (optional)", locale)}
            </Label>
            <Textarea
              id="asg-description"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="asg-file" className="text-[12px]">
              {localize("Brief (optional, PDF, DOCX or TXT)", locale)}
            </Label>
            <Input
              id="asg-file"
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={(event) => {
                const picked = event.target.files?.[0] ?? null;
                if (picked && picked.size > 20 * 1024 * 1024) {
                  toast.error(localize("Choose a PDF, DOCX or TXT file up to 20 MB", locale));
                  return;
                }
                setFile(picked);
              }}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {localize("Cancel", locale)}
          </Button>
          <Button size="sm" disabled={!valid || busy} onClick={() => void submit()}>
            {localize("Add assignment", locale)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
