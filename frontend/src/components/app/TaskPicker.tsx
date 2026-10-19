import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Assignment, Task } from "@/lib/data";
import { localize, useI18n } from "@/lib/i18n";

/** Pick an assignment first, then one of its open tasks: long task lists are hard to scan. */
export function TaskPicker({
  assignments,
  tasks,
  assignmentId,
  taskId,
  onAssignment,
  onTask,
  idPrefix = "picker",
}: {
  assignments: Assignment[];
  tasks: Task[];
  assignmentId: string;
  taskId: string;
  onAssignment: (id: string) => void;
  onTask: (id: string) => void;
  idPrefix?: string;
}) {
  const { locale } = useI18n();
  const open = useMemo(() => tasks.filter((task) => task.column !== "done"), [tasks]);
  const withTasks = useMemo(
    () =>
      assignments.filter(
        (item) =>
          item.status !== "Cancelled" &&
          item.status !== "Completed" &&
          open.some((task) => task.assignmentId === item.id),
      ),
    [assignments, open],
  );
  const options = open.filter((task) => task.assignmentId === assignmentId);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-assignment`} className="text-[12px]">
          {localize("Assignment", locale)}
        </Label>
        <Select
          value={assignmentId}
          onValueChange={(value) => {
            onAssignment(value);
            onTask("");
          }}
        >
          <SelectTrigger id={`${idPrefix}-assignment`}>
            <SelectValue placeholder={localize("Choose an assignment", locale)} />
          </SelectTrigger>
          <SelectContent>
            {withTasks.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!withTasks.length ? (
          <p className="text-[11.5px] text-muted-foreground">
            {localize("No assignment has open tasks yet.", locale)}
          </p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-task`} className="text-[12px]">
          {localize("Task", locale)}
        </Label>
        <Select value={taskId} onValueChange={onTask} disabled={!assignmentId}>
          <SelectTrigger id={`${idPrefix}-task`}>
            <SelectValue
              placeholder={localize(
                assignmentId ? "Choose a task" : "Choose an assignment first",
                locale,
              )}
            />
          </SelectTrigger>
          <SelectContent>
            {options.map((task) => (
              <SelectItem key={task.id} value={task.id}>
                {task.title} · {task.estimate}h
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
