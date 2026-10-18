import { guardWorkspace } from "@/lib/workspace-access";
import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/lib/store";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel } from "@/components/app/common";
import { LanguageSelector } from "@/components/app/LanguageSelector";

export const Route = createFileRoute("/settings")({
  beforeLoad: guardWorkspace,
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, 
    { title: "Settings — CampusPulse AI" }, { name: "description", content: "Profile, availability, agent behaviour and notification preferences." },
    { property: "og:title", content: "Settings — CampusPulse AI" }, { property: "og:description", content: "Profile, availability and agent preferences." },
  ] }),
  component: Settings,
});

const Row = ({ title, text, on = true }: { title: string; text: string; on?: boolean }) => (
  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b py-3 last:border-0">
    <div><div className="text-[13px] font-medium">{title}</div><div className="text-[12px] text-muted-foreground">{text}</div></div>
    <Switch aria-label={title} defaultChecked={on} onCheckedChange={(v) => toast(`${title} ${v ? "enabled" : "disabled"}`)} />
  </div>
);

function Settings() {
  const { role } = useStore();
  return (
    <>
      <PageHeader title="Settings" subtitle="Control how CampusPulse works for you." />
      <div className="grid max-w-4xl gap-4">
        <Panel title="Language"><label className="mb-2 block text-[13px]" htmlFor="interface-language">Interface language</label><LanguageSelector /></Panel>
        <Panel title="Profile">
          <div className="grid gap-3 md:grid-cols-3">
            <div><label htmlFor="profile-name" className="text-[12px] text-muted-foreground">Name</label><Input id="profile-name" key={role} defaultValue={role === "admin" ? "Academic Admin" : "Demo Student"} className="mt-1 h-9" /></div>
            <div><label htmlFor="profile-program" className="text-[12px] text-muted-foreground">{role === "admin" ? "Faculty" : "Program"}</label><Input id="profile-program" key={role} defaultValue={role === "admin" ? "Faculty of Computing" : "Software Engineering"} className="mt-1 h-9" /></div>
            <div><label htmlFor="profile-group" className="text-[12px] text-muted-foreground">{role === "admin" ? "Workspace" : "Group"}</label><Input id="profile-group" key={role} defaultValue={role === "admin" ? "Administration" : "SE-2429"} className="mt-1 h-9" /></div>
          </div>
          <Button size="sm" className="mt-3" onClick={() => toast.success("Profile saved")}>Save</Button>
        </Panel>
        {role === "student" && <Panel title="Availability">
          <div className="grid gap-3 md:grid-cols-3">
            <div><label htmlFor="availability-max" className="text-[12px] text-muted-foreground">Max study hours / day</label><Input id="availability-max" type="number" defaultValue={4} className="mt-1 h-9" /></div>
            <div><label htmlFor="availability-start" className="text-[12px] text-muted-foreground">Earliest start</label><Input id="availability-start" type="time" defaultValue="08:00" className="mt-1 h-9" /></div>
            <div><label htmlFor="availability-end" className="text-[12px] text-muted-foreground">Latest end</label><Input id="availability-end" type="time" defaultValue="21:00" className="mt-1 h-9" /></div>
          </div>
        </Panel>
        }
        <Panel title="AI agent">
          <Row title="Proactive insights" text="Let CampusPulse create recommendations in the background." />
          {role === "student" && <Row title="Automatic task generation" text="Generate Kanban tasks when a new assignment is detected." />}
          {role === "student" && <Row title="Share anonymised completion times" text="Contribute to historical workload statistics for your course." on={false} />}
        </Panel>
        <Panel title="Notifications">
          <Row title="Deadline reminders" text="48h and 24h before each deadline." />
          <Row title="Daily briefing" text="A summary every morning at 08:00." />
          <Row title="Event suggestions" text="Campus activities that fit your free time." on={false} />
        </Panel>
      </div>
    </>
  );
}
