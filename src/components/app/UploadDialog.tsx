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
  const { uploadOpen, setUploadOpen, addGeneratedTasks, log, tasksGenerated } = useStore();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"form" | "running" | "result">("form");
  const [course, setCourse] = useState("se");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<string | null>(null);
  const [deadline, setDeadline] = useState("2026-10-23");
  const [drag, setDrag] = useState(false);

  const reset = () => { setPhase("form"); setFile(null); setTitle(""); };
  const close = (o: boolean) => { setUploadOpen(o); if (!o) setTimeout(reset, 200); };
  const useDemo = () => { setCourse("se"); setTitle("Assignment 3 — JWT Authentication"); setFile("Assignment_3.pdf"); };
  const done = useCallback(() => {
    setPhase("result");
    log({ title: "Assignment 3 analyzed", detail: "6 requirements · dependency on Assignment 2 · 8.5h", kind: "analysis", status: "success" });
  }, [log]);

  const create = () => {
    const n = addGeneratedTasks();
    toast.success(n ? `${n} tasks added to Kanban` : "Tasks already on your board", { description: "Software Engineering · Assignment 3" });
    close(false);
    navigate({ to: "/kanban" });
  };

  return (
    <Dialog open={uploadOpen} onOpenChange={close}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-[16px]">{phase === "result" ? "Analysis complete" : "Upload assignment"}</DialogTitle>
          <DialogDescription className="text-[12.5px]">
            {phase === "form" && "CampusPulse will extract requirements, find related work and plan the tasks."}
            {phase === "running" && "Simulated analysis — no real AI model is called in this prototype."}
            {phase === "result" && "Review the structured results before adding tasks to your board."}
          </DialogDescription>
        </DialogHeader>

        {phase === "form" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-[12px]">Course</Label>
                <Select value={course} onValueChange={setCourse}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-1.5"><Label className="text-[12px]">Deadline (optional)</Label><Input type="date" className="h-9" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-[12px]">Assignment title</Label><Input className="h-9" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Assignment 3 — Authentication" /></div>
            <label
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) setFile(f.name); }}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-7 text-center transition-colors ${drag ? "border-primary bg-primary-soft" : "hover:border-primary/40"}`}
            >
              <input type="file" accept=".pdf" className="hidden" onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0].name)} />
              {file ? (<><FileText className="mb-2 h-6 w-6 text-primary" /><span className="text-[13px] font-medium">{file}</span><span className="text-[11.5px] text-muted-foreground">Ready to analyze</span></>) : (<><UploadCloud className="mb-2 h-6 w-6 text-muted-foreground" /><span className="text-[13px] font-medium">Drop a PDF here or click to browse</span><span className="text-[11.5px] text-muted-foreground">Up to 20 MB</span></>)}
            </label>
            <div className="flex items-center justify-between pt-1">
              <Button variant="ghost" size="sm" onClick={useDemo}><Sparkles className="h-3.5 w-3.5 text-primary" /> Use Demo Assignment</Button>
              <Button size="sm" disabled={!file} onClick={() => setPhase("running")}>Analyze Assignment</Button>
            </div>
          </div>
        )}

        {phase === "running" && <div className="py-2"><AnalysisProgress running onDone={done} steps={steps} /></div>}

        {phase === "result" && (
          <div className="space-y-3 text-[13px]">
            <div className="grid grid-cols-3 gap-2">
              {[["Course", "Software Engineering"], ["Deadline", "Oct 23, 2026"], ["Estimate", "8.5 hours"]].map(([k, v]) => (
                <div key={k} className="rounded-md border bg-secondary/50 px-3 py-2"><div className="text-[11px] text-muted-foreground">{k}</div><div className="font-medium">{v}</div></div>
              ))}
            </div>
            <div className="rounded-md border p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium"><CheckCircle2 className="h-3.5 w-3.5 text-success" /> {requirements.length} requirements extracted</div>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">{requirements.map((r) => <li key={r.id}><span className="font-mono text-[11px] text-foreground">{r.id}</span> {r.text}</li>)}</ul>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-info/20 bg-info-soft px-3 py-2 text-[12.5px]"><Link2 className="h-3.5 w-3.5 text-info" /> Extends <b>Assignment 2 — Database Integration</b></div>
            <div className="rounded-md border p-3">
              <div className="mb-1.5 text-[12px] font-medium">{generatedTasks.length} generated tasks</div>
              {generatedTasks.map((t) => <div key={t.title} className="flex justify-between py-0.5 text-[12px]"><span>{t.title}</span><span className="tabular-nums text-muted-foreground">{t.estimate}h</span></div>)}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { close(false); navigate({ to: "/assignments/$assignmentId", params: { assignmentId: "se-a3" } }); }}>Open Assignment</Button>
              <Button size="sm" onClick={create}>{tasksGenerated ? "View Kanban" : "Create Kanban Tasks"}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
