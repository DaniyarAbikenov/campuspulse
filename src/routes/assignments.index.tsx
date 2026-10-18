import { localize, useI18n } from "@/lib/i18n";
import { guardWorkspace } from "@/lib/workspace-access";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/app/common";
import { AssignmentTable } from "@/components/app/widgets";
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

const filters = ["All", "In Progress", "To Do", "Upcoming", "Completed"] as const;

function Assignments() {
  useI18n();
  const { setUploadOpen, assignments } = useStore();
  const [f, setF] = useState<(typeof filters)[number]>("All");
  const ids = assignments.filter((a) => f === "All" || a.status === f).map((a) => a.id);
  return (
    <>
      <PageHeader title={localize("Assignments")} subtitle={localize("Upload a brief and CampusPulse will extract requirements and plan the work.")} actions={<Button size="sm" onClick={() => setUploadOpen(true)}><Upload className="h-3.5 w-3.5" /> {localize("Upload Assignment")}</Button>} />
      <div className="mb-3 flex flex-wrap gap-1">
        {localize(filters.map((x) => <Button variant="ghost" size="sm" aria-pressed={f === x} key={x} onClick={() => setF(x)} className={cn("rounded-md px-2.5 py-1 text-[12.5px]", f === x ? "bg-card font-medium shadow-[0_0_0_1px_var(--border)]" : "text-muted-foreground hover:text-foreground")}>{x} <span className="text-muted-foreground">{x === "All" ? assignments.length : assignments.filter((a) => a.status === x).length}</span></Button>))}
      </div>
      <Panel bodyClass="p-0"><AssignmentTable ids={ids} /></Panel>
    </>
  );
}
