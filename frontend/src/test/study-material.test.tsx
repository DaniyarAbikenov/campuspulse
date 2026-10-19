import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StudyMaterial } from "@/components/app/StudyMaterial";

describe("Study material on a task", () => {
  it("lists each lecture passage with its page", () => {
    render(
      <StudyMaterial
        resources={[
          {
            documentId: "d1",
            documentName: "Lecture 6",
            page: 4,
            excerpt: "A jwt token proves who the user is.",
          },
        ]}
      />,
    );
    expect(screen.getByText(/Lecture 6/)).toHaveTextContent("p. 4");
    expect(screen.getByText("A jwt token proves who the user is.")).toBeInTheDocument();
  });

  it("renders nothing when no passage was found", () => {
    const { container } = render(<StudyMaterial resources={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
