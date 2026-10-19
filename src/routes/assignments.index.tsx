import { localize, useI18n } from "@/lib/i18n";
import { guardWorkspace } from "@/lib/workspace-access";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Search, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/app/common";
import { AssignmentTable } from "@/components/app/widgets";
import { ImportProposals } from "@/components/app/ImportProposals";
import { AssignmentFormDialog } from "@/components/app/AssignmentFormDialog";
import { useStore } from "@/lib/store";
import { assignments } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/assignments/")({
  beforeLoad: guardWorkspace,
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, 
    { title: "Assignments — CampusPulse AI" }, { name: "description", content: "All assignments across your courses with estimates and progress." },
    { property: "og:title", content: "Assignments — CampusPulse AI" }, { property: "og:description", content: "All assignments across your courses with estimates and progress." },
  ] }),
  component: Assignments,
});

const filters = ["All", "In Progress", "To Do", "Upcoming", "Completed", "Cancelled"] as const;

function Assignments() {
  const { locale } = useI18n();
  const { setUploadOpen, assignments, backendConnected, courses } = useStore();
  const [query, setQuery] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState<(typeof filters)[number]>("All");
  const needle = query.trim().toLowerCase();
  const ids = assignments.filter((a) => (f === "All" || a.status === f) && (courseFilter === "all" || a.courseId === courseFilter) && (!needle || a.title.toLowerCase().includes(needle))).map((a) => a.id);
  return (
    <>
      <PageHeader title={localize("Assignments", locale)} subtitle={localize("Upload a brief and CampusPulse will extract requirements and plan the work.", locale)} actions={<>{backendConnected ? <Button size="sm" variant="outline" onClick={() => setCreating(true)}><Plus className="h-3.5 w-3.5" /> {localize("New assignment", locale)}</Button> : null}<Button size="sm" onClick={() => setUploadOpen(true)}><Upload className="h-3.5 w-3.5" /> {localize("Upload Assignment", locale)}</Button></>} />
      <AssignmentFormDialog open={creating} onOpenChange={setCreating} />
      <ImportProposals />
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-0 basis-full sm:flex-1 sm:basis-auto">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <Input aria-label={localize("Search assignments", locale)} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={localize("Search assignments…", locale)} className="h-9 pl-8 text-[13px]" />
        </div>
        <Select value={courseFilter} onValueChange={setCourseFilter}>
          <SelectTrigger aria-label={localize("Filter by course", locale)} className="h-9 w-full sm:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{localize("All courses", locale)}</SelectItem>
            {courses.map((course) => <SelectItem key={course.id} value={course.id}>{course.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="mb-3 flex flex-wrap gap-1">
        {localize(filters.map((x) => <Button variant="ghost" size="sm" aria-pressed={f === x} key={x} onClick={() => setF(x)} className={cn("rounded-md px-2.5 py-1 text-[12.5px]", f === x ? "bg-card font-medium shadow-[0_0_0_1px_var(--border)]" : "text-muted-foreground hover:text-foreground")}>{localize(x, locale)} <span className="text-muted-foreground">{localize(x === "All" ? assignments.length : assignments.filter((a) => a.status === x).length, locale)}</span></Button>), locale)}
      </div>
      <Panel bodyClass="p-0"><AssignmentTable ids={ids} /></Panel>
    </>
  );
}
