import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskPlanReview } from "@/components/app/TaskPlanReview";
import type { TaskPlan } from "@/lib/api";

const applyTaskPlan = vi.fn().mockResolvedValue({ created: 1 });
const dismissTaskPlan = vi.fn().mockResolvedValue(undefined);
const updatePlanItem = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/api", () => ({
  applyTaskPlan: (...args: unknown[]) => applyTaskPlan(...args),
  dismissTaskPlan: (...args: unknown[]) => dismissTaskPlan(...args),
  updatePlanItem: (...args: unknown[]) => updatePlanItem(...args),
}));

const plan: TaskPlan = {
  id: "plan-1",
  assignmentId: "a1",
  summary: "Secure the service.",
  relatedTitle: "Assignment 2 — Database Integration",
  relation: "extends",
  items: [
    { id: "i1", requirementId: "R1", requirementText: "JWT login", quote: "Implement JWT", page: 2, quoteVerified: true, title: "Implement JWT", description: "", estimatedHours: 1.5, priority: "high", selected: true },
    { id: "i2", requirementId: "R2", requirementText: "Secure endpoints", quote: "Made up quote", page: 2, quoteVerified: false, title: "Secure endpoints", description: "", estimatedHours: 2, priority: "medium", selected: true },
  ],
};

describe("TaskPlanReview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows citations, the related assignment and warns about unverified quotes", () => {
    render(<TaskPlanReview initial={plan} steps={[]} onApplied={() => {}} onDismissed={() => {}} />);
    expect(screen.getByText("Assignment 2 — Database Integration")).toBeInTheDocument();
    expect(screen.getByText(/quote not found in the document/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1 selected tasks cite text");
    expect(screen.getByText(/3\.5h/)).toBeInTheDocument();
  });

  it("saves edits, drops a task and only then approves", async () => {
    const onApplied = vi.fn();
    render(<TaskPlanReview initial={plan} steps={[]} onApplied={onApplied} onDismissed={() => {}} />);
    fireEvent.click(screen.getByLabelText("Secure endpoints"));
    expect(updatePlanItem).toHaveBeenCalledWith("plan-1", "i2", { selected: false });
    fireEvent.change(screen.getByLabelText(/Implement JWT$/, { selector: "input[type=number]" }), { target: { value: "2.5" } });
    expect(updatePlanItem).toHaveBeenCalledWith("plan-1", "i1", { estimatedHours: 2.5 });
    expect(applyTaskPlan).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Approve and add to Kanban \(1\)/ }));
    await waitFor(() => expect(onApplied).toHaveBeenCalledWith(1));
    expect(applyTaskPlan).toHaveBeenCalledWith("plan-1");
  });

  it("can discard the plan without creating anything", async () => {
    const onDismissed = vi.fn();
    render(<TaskPlanReview initial={plan} steps={[]} onApplied={() => {}} onDismissed={onDismissed} />);
    fireEvent.click(screen.getByRole("button", { name: "Discard plan" }));
    await waitFor(() => expect(onDismissed).toHaveBeenCalled());
    expect(applyTaskPlan).not.toHaveBeenCalled();
  });

  it("disables approval when nothing is selected", () => {
    render(<TaskPlanReview initial={plan} steps={[]} onApplied={() => {}} onDismissed={() => {}} />);
    fireEvent.click(screen.getByLabelText("Implement JWT", { selector: "input[type=checkbox]" }));
    fireEvent.click(screen.getByLabelText("Secure endpoints", { selector: "input[type=checkbox]" }));
    expect(screen.getByRole("button", { name: /Approve and add to Kanban \(0\)/ })).toBeDisabled();
  });
});
