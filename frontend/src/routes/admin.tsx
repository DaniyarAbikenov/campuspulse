import { guardWorkspace } from "@/lib/workspace-access";
import { createFileRoute } from "@tanstack/react-router";
import { AdminDashboard } from "@/components/app/AdminViews";

export const Route = createFileRoute("/admin")({
  beforeLoad: guardWorkspace,
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, 
    { title: "Academic Overview — CampusPulse AI" }, { name: "description", content: "Administrator view of student workload, at-risk cohorts and deadline clustering." },
    { property: "og:title", content: "Academic Overview — CampusPulse AI" }, { property: "og:description", content: "Administrator view of student workload and deadline clustering." },
  ] }),
  component: AdminDashboard,
});

