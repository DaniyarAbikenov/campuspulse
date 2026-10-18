import { localize, useI18n } from "@/lib/i18n";
import { useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { UploadCloud, FileText, Sparkles, CheckCircle2, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStore } from "@/lib/store";
import { courses, generatedTasks, requirements } from "@/lib/data";
import { AnalysisProgress } from "./AnalysisProgress";

const steps = ["Reading PDF", "Extracting requirements", "Finding previous assignments", "Detecting dependencies", "Estimating workload", "Generating tasks"];

export function UploadDialog() {
  const { locale } = useI18n();
  const { uploadOpen, setUploadOpen, addGeneratedTasks, log, tasksGenerated, proposalApproved, approveProposal, recordAnalysis, proposalTasks, analysisSource } = useStore();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"form" | "running" | "result">("form");
  const [course, setCourse] = useState("se");
  const [title, setTitle] = useState("Assignment 3 — JWT Authentication");
  const [file, setFile] = useState<string | null>(null);
  const [deadline, setDeadline] = useState("2026-10-23");
  const [drag, setDrag] = useState(false);

  const reset = () => { setPhase("form"); setFile(null); setTitle(""); };
  const close = (o: boolean) => { setUploadOpen(o); if (!o) setTimeout(reset, 200); };
  const useDemo = () => { setCourse("se"); setTitle("Assignment 3 — JWT Authentication"); setFile("Assignment_3.pdf"); };
  const done = useCallback(() => {
    setPhase("result");
    recordAnalysis(file ?? "Assignment_3.pdf");
  }, [recordAnalysis, file]);

  const create = () => {
    const n = addGeneratedTasks();
    toast.success(n ? `${n} tasks added to Kanban` : "Tasks already on your board", { description: localize("Software Engineering · Assignment 3", locale) });
    close(false);
    navigate({ to: "/kanban" });
  };

  return (
    <Dialog open={uploadOpen} onOpenChange={close}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-[16px]">{localize(phase === "result" ? "Analysis complete" : "Upload assignment", locale)}</DialogTitle>
          <DialogDescription className="text-[12.5px]">
            {localize(phase === "form" && "Demo analysis uses the Assignment 3 fixture, not the contents of your PDF. Course and deadline are fixed for this scenario.", locale)}
            {localize(phase === "running" && "Simulated analysis — no real AI model is called in this prototype.", locale)}
            {localize(phase === "result" && `${analysisSource} · simulated fixture · review, approve, then import.`, locale)}
          </DialogDescription>
        </DialogHeader>

        {localize(phase === "form" && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="upload-course" className="text-[12px]">{localize("Course", locale)}</Label>
                <Select disabled value={course} onValueChange={setCourse}><SelectTrigger id="upload-course" className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{localize(courses.map((c) => <SelectItem key={c.id} value={c.id}>{localize(c.name, locale)}</SelectItem>), locale)}</SelectContent></Select>
              </div>
              <div className="space-y-1.5"><Label htmlFor="upload-deadline" className="text-[12px]">{localize("Deadline", locale)}</Label><Input id="upload-deadline" readOnly type="date" className="h-9" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="upload-title" className="text-[12px]">{localize("Assignment title", locale)}</Label><Input id="upload-title" className="h-9" readOnly value={title} placeholder={localize("e.g. Assignment 3 — Authentication", locale)} /></div>
            <label
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f && f.name.toLowerCase().endsWith(".pdf") && f.size <= 20 * 1024 * 1024) setFile(f.name); else toast.error(localize("Choose a PDF up to 20 MB", locale)); }}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-7 text-center transition-colors ${drag ? "border-primary bg-primary-soft" : "hover:border-primary/40"}`}
            >
              <input aria-label={localize("Upload PDF", locale)} type="file" accept=".pdf" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f && f.name.toLowerCase().endsWith(".pdf") && f.size <= 20 * 1024 * 1024) setFile(f.name); else toast.error(localize("Choose a PDF up to 20 MB", locale)); }} />
              {localize(file ? (<><FileText className="mb-2 h-6 w-6 text-primary" /><span className="text-[13px] font-medium">{localize(file, locale)}</span><span className="text-[11.5px] text-muted-foreground">{localize("Ready to analyze", locale)}</span></>) : (<><UploadCloud className="mb-2 h-6 w-6 text-muted-foreground" /><span className="text-[13px] font-medium">{localize("Drop a PDF here or click to browse", locale)}</span><span className="text-[11.5px] text-muted-foreground">{localize("Up to 20 MB", locale)}</span></>), locale)}
            </label>
            <div className="flex items-center justify-between pt-1">
              <Button variant="ghost" size="sm" onClick={useDemo}><Sparkles className="h-3.5 w-3.5 text-primary" /> {localize("Use Demo Assignment", locale)}</Button>
              <Button size="sm" disabled={!file} onClick={() => setPhase("running")}>{localize("Analyze Assignment", locale)}</Button>
            </div>
          </div>
        ), locale)}

        {localize(phase === "running" && <div className="py-2"><AnalysisProgress running onDone={done} steps={steps} /></div>, locale)}

        {localize(phase === "result" && (
          <div className="space-y-3 text-[13px]">
            <div className="grid grid-cols-3 gap-2">
              {localize([["Course", "Software Engineering"], ["Deadline", "Oct 23, 2026"], ["Estimate", `${proposalTasks.reduce((sum, task) => sum + task.estimate, 0)} hours`]].map(([k, v]) => (
                <div key={k} className="rounded-md border bg-secondary/50 px-3 py-2"><div className="text-[11px] text-muted-foreground">{localize(k, locale)}</div><div className="font-medium">{localize(v, locale)}</div></div>
              )), locale)}
            </div>
            <div className="rounded-md border p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium"><CheckCircle2 className="h-3.5 w-3.5 text-success" /> {localize(requirements.length, locale)} {localize("requirements extracted", locale)}</div>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">{localize(requirements.map((r) => <li key={r.id}><span className="font-mono text-[11px] text-foreground">{localize(r.id, locale)}</span> {localize(r.text, locale)}</li>), locale)}</ul>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-info/20 bg-info-soft px-3 py-2 text-[12.5px]"><Link2 className="h-3.5 w-3.5 text-info" /> {localize("Extends", locale)} <b>{localize("Assignment 2 — Database Integration", locale)}</b></div>
            <div className="rounded-md border p-3">
              <div className="mb-1.5 text-[12px] font-medium">{localize(proposalTasks.length, locale)} {localize("generated tasks", locale)}</div>
              {localize(proposalTasks.map((t) => <div key={t.title} className="flex justify-between py-0.5 text-[12px]"><span>{localize(t.title, locale)}</span><span className="tabular-nums text-muted-foreground">{localize(t.estimate, locale)}{localize("h", locale)}</span></div>), locale)}
            </div>
            <div className="border-l-2 border-ai bg-ai-soft p-2 text-[12px]" role="status">{localize(tasksGenerated ? "Imported to Kanban. Scheduling is a separate step." : proposalApproved ? "Approved, not imported. No board tasks or calendar sessions have been created." : "Generated, not imported. Review and approve before importing; the board and calendar are unchanged.", locale)}</div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { close(false); navigate({ to: "/assignments/$assignmentId", params: { assignmentId: "se-a3" } }); }}>{localize("Open Assignment", locale)}</Button>
              {localize(!proposalApproved && !tasksGenerated && <Button size="sm" onClick={approveProposal}>{localize("Approve task plan", locale)}</Button>, locale)}
              <Button size="sm" disabled={!proposalApproved && !tasksGenerated} onClick={create}>{localize(tasksGenerated ? "View Kanban" : "Import approved tasks", locale)}</Button>
            </div>
          </div>
        ), locale)}
      </DialogContent>
    </Dialog>
  );
}
