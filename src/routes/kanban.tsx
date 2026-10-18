import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/app/common";
import { KanbanBoard, NewTaskButton } from "@/components/app/Kanban";
import { useStore } from "@/lib/store";
import { courses } from "@/lib/data";

export const Route = createFileRoute("/kanban")({
  head: () => ({ meta: [
    { title: "Kanban Board — CampusPulse AI" }, { name: "description", content: "Drag academic tasks across stages, including AI-generated tasks." },
    { property: "og:title", content: "Kanban Board — CampusPulse AI" }, { property: "og:description", content: "Drag academic tasks across stages, including AI-generated tasks." },
  ] }),
  component: Kanban,
});

function Kanban() {
  const { tasks, addGeneratedTasks, tasksGenerated } = useStore();
  const [course, setCourse] = useState("all");
  const [onlyAi, setOnlyAi] = useState(false);
  const total = tasks.filter((t) => t.column !== "done").reduce((s, t) => s + t.estimate, 0);
  return (
    <>
      <PageHeader title="Kanban Board" subtitle={`${tasks.length} tasks · ${total}h open work across all courses`} actions={<>
        <Select value={course} onValueChange={setCourse}><SelectTrigger className="h-8 w-48 text-[12.5px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All courses</SelectItem>{courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
        <Button size="sm" variant={onlyAi ? "default" : "outline"} onClick={() => setOnlyAi(!onlyAi)}><Sparkles className="h-3.5 w-3.5" /> AI-generated</Button>
        {!tasksGenerated && <Button size="sm" variant="outline" onClick={() => { addGeneratedTasks(); toast.success("6 tasks added from Assignment 3"); }}>Import Assignment 3 tasks</Button>}
        <NewTaskButton />
      </>} />
      <div className="overflow-x-auto pb-2">
        <KanbanBoard courseId={course === "all" ? undefined : course} filter={onlyAi ? (t) => !!t.ai : undefined} />
      </div>
    </>
  );
}
