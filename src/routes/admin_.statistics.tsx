import { createFileRoute } from "@tanstack/react-router";
import { AdminStatistics } from "@/components/app/AdminViews";
import { guardWorkspace } from "@/lib/workspace-access";

export const Route = createFileRoute("/admin_/statistics")({
  beforeLoad: guardWorkspace,
  head: () => ({ meta: [
    { title: "Faculty Workload Statistics — CampusPulse AI" },
    { name: "description", content: "Anonymised faculty workload forecasts and course-level overload statistics." },
    { property: "og:title", content: "Faculty Workload Statistics — CampusPulse AI" },
    { property: "og:description", content: "Anonymised faculty workload forecasts and course-level overload statistics." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: AdminStatistics,
});