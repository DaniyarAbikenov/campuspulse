import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Onboarding } from "@/components/app/Onboarding";

const completeOnboarding = vi.fn().mockResolvedValue(undefined);
const signOut = vi.fn();

vi.mock("@/lib/store", () => ({ useStore: () => ({ completeOnboarding, signOut }) }));
vi.mock("@/lib/api", () => ({
  fetchOnboardingOptions: () =>
    Promise.resolve({
      institutions: [
        {
          id: "inst-1",
          name: "Astana IT University",
          shortName: "AITU",
          courses: [
            { id: "c1", code: "SE 3204", name: "Software Engineering" },
            { id: "c2", code: "CS 3112", name: "Advanced Databases" },
          ],
        },
      ],
    }),
}));

describe("Onboarding", () => {
  beforeEach(() => completeOnboarding.mockClear());

  it("sends the chosen university, details and courses", async () => {
    render(<Onboarding />);
    await screen.findByText("SE 3204");
    fireEvent.change(screen.getByLabelText("Student number"), { target: { value: " 240028 " } });
    fireEvent.change(screen.getByLabelText("Program"), { target: { value: "Software Engineering" } });
    fireEvent.click(screen.getByLabelText(/CS 3112/));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(completeOnboarding).toHaveBeenCalledTimes(1));
    expect(completeOnboarding).toHaveBeenCalledWith({
      institutionId: "inst-1",
      studentNumber: "240028",
      program: "Software Engineering",
      courseIds: ["c2"],
    });
  });

  it("shows the server error and keeps the form usable", async () => {
    completeOnboarding.mockRejectedValueOnce(new Error("409: Student number is already in use"));
    render(<Onboarding />);
    await screen.findByText("SE 3204");
    fireEvent.change(screen.getByLabelText("Student number"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Program"), { target: { value: "SE" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already in use");
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("lets a new user sign out", async () => {
    render(<Onboarding />);
    await screen.findByText("SE 3204");
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalled();
  });
});
