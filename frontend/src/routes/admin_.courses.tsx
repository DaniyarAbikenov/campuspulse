import { createFileRoute } from "@tanstack/react-router";
import { AdminCourses } from "@/components/app/AdminViews";
import { guardWorkspace } from "@/lib/workspace-access";

export const Route = createFileRoute("/admin_/courses")({
  beforeLoad: guardWorkspace,
  head: () => ({ meta: [
    { title: "Faculty Courses — CampusPulse AI" },
    { name: "description", content: "Faculty course enrolments, instructor estimates and aggregated overload risk." },
    { property: "og:title", content: "Faculty Courses — CampusPulse AI" },
    { property: "og:description", content: "Faculty course enrolments and aggregated overload risk." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: AdminCourses,
});