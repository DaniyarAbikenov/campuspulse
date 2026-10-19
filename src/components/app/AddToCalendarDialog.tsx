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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TaskPicker } from "@/components/app/TaskPicker";
import { createRemoteActivity, createRemoteSeries, createRemoteStudySession, errorText } from "@/lib/api";
import type { FreeSlot } from "@/lib/data";
import { intlLocale, localize, useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { addDays, daysBetween } from "@/lib/week";
import { cn } from "@/lib/utils";

const clock = (hours: number) => {
  const total = Math.round(hours * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};
const toHours = (time: string) => {
  const [hours = "0", minutes = "0"] = time.split(":");
  return Number(hours) + Number(minutes) / 60;
};

type Mode = "study" | "activity" | "repeat";

/** Add study time, a one-off activity or a repeating one (a workout, a job, a class). */
export function AddToCalendarDialog({
  open,
  onOpenChange,
  slot,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slot: FreeSlot | null;
}) {
  const { locale } = useI18n();
  const {
    assignments,
    tasks,
    courses,
    weekStart,
    today,
    backendConnected,
    addEvent,
    reloadWorkspace,
  } = useStore();
  const [mode, setMode] = useState<Mode>("study");
  const [assignmentId, setAssignmentId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [location, setLocation] = useState("");
  const [courseId, setCourseId] = useState("");
  const [kind, setKind] = useState<"personal" | "class_session">("personal");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);

  // Each time the dialog opens it starts from the chosen free slot (or the first day shown).
  // Reset only when the dialog opens, never while it is open: store updates must not wipe what is typed.
  const wasOpen = useRef(false);
  useEffect(() => {
    const justOpened = open && !wasOpen.current;
    wasOpen.current = open;
    if (!justOpened) return;
    setMode("study");
    setAssignmentId("");
    setTaskId("");
    setTitle("");
    setLocation("");
    setCourseId("");
    setKind("personal");
    setWeekdays([]);
    setUntil("");
    setDate(slot ? addDays(weekStart, slot.day) : weekStart > today ? weekStart : today);
    setStart(slot ? clock(slot.start) : "09:00");
    setEnd(slot ? clock(slot.end) : "10:00");
  }, [open, slot, weekStart, today]);

  const task = tasks.find((item) => item.id === taskId);
  // A free slot may be longer than the task: book only what the task needs.
  useEffect(() => {
    if (mode !== "study" || !task) return;
    setEnd(clock(Math.min(slot ? slot.end : 23.75, toHours(start) + Math.max(task.estimate, 0.5))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const valid =
    toHours(end) > toHours(start) &&
    (mode === "study" ? !!task : title.trim().length > 0) &&
    (mode !== "repeat" || weekdays.length > 0) &&
    (mode === "repeat" ? !!date : !!date);

  const submit = async () => {
    setBusy(true);
    try {
      if (!backendConnected) {
        const day = daysBetween(weekStart, date);
        if (day < 0 || day > 6)
          throw new Error(localize("Pick a day inside the week shown (demo mode).", locale));
        await addEvent({
          day,
          start: toHours(start),
          end: toHours(end),
          title: mode === "study" && task ? `Study: ${task.title}` : title.trim(),
          kind: mode === "study" ? "study" : "personal",
          ...(task ? { courseId: task.courseId, taskId: task.id } : {}),
        });
      } else if (mode === "study" && task) {
        await createRemoteStudySession({
          title: `Study: ${task.title}`,
          date,
          start,
          end,
          taskId: task.id,
          ...(task.courseId
            ? {
                courseId:
                  courses.find((item) => item.id === task.courseId)?.backendId ?? task.courseId,
              }
            : {}),
        });
        await reloadWorkspace();
      } else if (mode === "activity") {
        await createRemoteActivity({
          title: title.trim(),
          date,
          start,
          end,
          ...(location.trim() ? { location: location.trim() } : {}),
          ...(courseId ? { courseId } : {}),
        });
        await reloadWorkspace();
      } else {
        const created = await createRemoteSeries({
          title: title.trim(),
          kind,
          weekdays,
          start,
          end,
          startsOn: date,
          ...(until ? { endsOn: until } : {}),
          ...(location.trim() ? { location: location.trim() } : {}),
          ...(courseId ? { courseId } : {}),
        });
        await reloadWorkspace();
        toast.success(localize("Repeating activity added", locale), {
          description: `${created.occurrences} ${localize("occurrences in your calendar", locale)}`,
        });
        onOpenChange(false);
        return;
      }
      toast.success(localize("Added to your calendar", locale));
      onOpenChange(false);
    } catch (error) {
      toast.error(localize("Could not add to the calendar", locale), {
        description: errorText(error),
      });
    } finally {
      setBusy(false);
    }
  };

  const names = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(intlLocale(locale), { weekday: "short", timeZone: "UTC" }).format(
      new Date(addDays(weekStart, index)),
    ),
  );
  const timeFields = (
    <div className="grid grid-cols-3 gap-3">
      <div className="space-y-1.5">
        <Label htmlFor="cal-date" className="text-[12px]">
          {localize(mode === "repeat" ? "Starting" : "Date", locale)}
        </Label>
        <Input
          id="cal-date"
          type="date"
          min={today}
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cal-start" className="text-[12px]">
          {localize("From", locale)}
        </Label>
        <Input
          id="cal-start"
          type="time"
          value={start}
          onChange={(event) => setStart(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cal-end" className="text-[12px]">
          {localize("To", locale)}
        </Label>
        <Input
          id="cal-end"
          type="time"
          value={end}
          onChange={(event) => setEnd(event.target.value)}
        />
      </div>
    </div>
  );
  const details = (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="cal-title" className="text-[12px]">
          {localize("Title", locale)}
        </Label>
        <Input
          id="cal-title"
          value={title}
          maxLength={240}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={localize(
            mode === "repeat" ? "e.g. Gym, Part-time job, Databases" : "e.g. Dentist, Team meeting",
            locale,
          )}
        />
      </div>
      {timeFields}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cal-location" className="text-[12px]">
            {localize("Place (optional)", locale)}
          </Label>
          <Input
            id="cal-location"
            value={location}
            maxLength={240}
            onChange={(event) => setLocation(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cal-course" className="text-[12px]">
            {localize("Course (optional)", locale)}
          </Label>
          <Select
            value={courseId || "none"}
            onValueChange={(value) => setCourseId(value === "none" ? "" : value)}
          >
            <SelectTrigger id="cal-course">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{localize("No course", locale)}</SelectItem>
              {courses.map((item) => (
                <SelectItem key={item.id} value={item.backendId ?? item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[16px]">{localize("Add to calendar", locale)}</DialogTitle>
          <DialogDescription>
            {slot
              ? localize(slot.label, locale)
              : localize("Study time, activities and classes", locale)}
          </DialogDescription>
        </DialogHeader>
        <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="study">{localize("Study session", locale)}</TabsTrigger>
            <TabsTrigger value="activity">{localize("Activity", locale)}</TabsTrigger>
            <TabsTrigger value="repeat" disabled={!backendConnected}>
              {localize("Repeating", locale)}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="study" className="space-y-3">
            <TaskPicker
              assignments={assignments}
              tasks={tasks}
              assignmentId={assignmentId}
              taskId={taskId}
              onAssignment={setAssignmentId}
              onTask={setTaskId}
              idPrefix="cal"
            />
            {timeFields}
          </TabsContent>
          <TabsContent value="activity" className="space-y-3">
            {details}
          </TabsContent>
          <TabsContent value="repeat" className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[12px]">{localize("Type", locale)}</Label>
              <div className="flex gap-2">
                {(
                  [
                    ["personal", "Activity (workout, work…)"],
                    ["class_session", "Class (semester subject)"],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={kind === value ? "default" : "outline"}
                    aria-pressed={kind === value}
                    onClick={() => setKind(value)}
                  >
                    {localize(label, locale)}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">{localize("Repeats on", locale)}</Label>
              <div
                className="flex flex-wrap gap-1.5"
                role="group"
                aria-label={localize("Repeats on", locale)}
              >
                {names.map((name, index) => (
                  <Button
                    key={name}
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-pressed={weekdays.includes(index)}
                    className={cn(
                      "h-8 w-12",
                      weekdays.includes(index) && "border-primary bg-primary-soft text-primary",
                    )}
                    onClick={() =>
                      setWeekdays((current) =>
                        current.includes(index)
                          ? current.filter((day) => day !== index)
                          : [...current, index],
                      )
                    }
                  >
                    {name}
                  </Button>
                ))}
              </div>
            </div>
            {details}
            <div className="space-y-1.5">
              <Label htmlFor="cal-until" className="text-[12px]">
                {localize("Until (empty = end of the semester)", locale)}
              </Label>
              <Input
                id="cal-until"
                type="date"
                value={until}
                min={date}
                onChange={(event) => setUntil(event.target.value)}
              />
            </div>
          </TabsContent>
        </Tabs>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {localize("Cancel", locale)}
          </Button>
          <Button size="sm" disabled={!valid || busy} onClick={() => void submit()}>
            {localize("Add to calendar", locale)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
