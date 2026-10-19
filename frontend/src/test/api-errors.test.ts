import { describe, expect, it } from "vitest";
import { describeFailure } from "@/lib/api";

describe("API failures shown to people", () => {
  it("uses the backend's own sentence", () => {
    expect(describeFailure(409, '{"detail":"That time overlaps “Class”"}')).toBe(
      "That time overlaps “Class”",
    );
  });

  it("turns validation problems into plain words, never raw JSON", () => {
    const body = JSON.stringify({
      detail: [
        {
          type: "string_too_short",
          loc: ["body", "group_name"],
          msg: "String should have at least 1 character",
        },
      ],
    });
    expect(describeFailure(422, body)).toBe("Group cannot be empty");
  });

  it("falls back to a sentence for empty or HTML bodies", () => {
    expect(describeFailure(500, "<html>boom</html>")).toMatch(/went wrong/);
    expect(describeFailure(404, "")).toMatch(/no longer exists/);
    expect(describeFailure(401, "")).toMatch(/Sign in/);
  });
});
