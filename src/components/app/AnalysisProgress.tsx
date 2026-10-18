import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const analysisSteps = ["Reading document", "Extracting requirements", "Checking course context", "Detecting dependencies", "Estimating workload", "Generating tasks"];

export function AnalysisProgress({ running, onDone, steps = analysisSteps }: { running: boolean; onDone: () => void; steps?: string[] }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!running) { setStep(0); return; }
    if (step >= steps.length) { onDone(); return; }
    const t = setTimeout(() => setStep((s) => s + 1), 650 + Math.random() * 350);
    return () => clearTimeout(t);
  }, [running, step, steps.length, onDone]);

  return (
    <div className="space-y-1.5">
      <div className="mb-3 h-1 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary transition-all duration-500" style={{ width: `${(step / steps.length) * 100}%` }} /></div>
      {steps.map((s, i) => (
        <div key={s} className={cn("flex items-center gap-2.5 text-[13px] transition-opacity", i > step && "opacity-40")}>
          <span className={cn("flex h-5 w-5 items-center justify-center rounded-full border", i < step && "border-success bg-success-soft text-success", i === step && "border-primary text-primary")}>
            {i < step ? <Check className="h-3 w-3" /> : i === step ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="text-[10px]">{i + 1}</span>}
          </span>
          <span className={cn(i === step && "font-medium")}>{s}</span>
          {i < step && <span className="ml-auto text-[11px] text-muted-foreground">done</span>}
        </div>
      ))}
    </div>
  );
}
