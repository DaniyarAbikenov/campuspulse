import { localize, useI18n } from "@/lib/i18n";
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

const Row = ({ title, text, on = true }: { title: string; text: string; on?: boolean }) => { const { locale } = useI18n(); return (
  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b py-3 last:border-0">
    <div><div className="text-[13px] font-medium">{localize(title, locale)}</div><div className="text-[12px] text-muted-foreground">{localize(text, locale)}</div></div>
    <Switch aria-label={localize(title, locale)} defaultChecked={on} onCheckedChange={(v) => toast(localize(`${title} ${v ? "enabled" : "disabled"}`, locale))} />
  </div>
); };

function Settings() {
  const { locale } = useI18n();
  const { role } = useStore();
  return (
    <>
      <PageHeader title={localize("Settings", locale)} subtitle={localize("Control how CampusPulse works for you.", locale)} />
      <div className="grid max-w-4xl gap-4">
        <Panel title={localize("Language", locale)}><label className="mb-2 block text-[13px]" htmlFor="interface-language">{localize("Interface language", locale)}</label><LanguageSelector /></Panel>
        <Panel title={localize("Profile", locale)}>
          <div className="grid gap-3 md:grid-cols-3">
            <div><label htmlFor="profile-name" className="text-[12px] text-muted-foreground">{localize("Name", locale)}</label><Input id="profile-name" key={role} defaultValue={role === "admin" ? "Academic Admin" : "Demo Student"} className="mt-1 h-9" /></div>
            <div><label htmlFor="profile-program" className="text-[12px] text-muted-foreground">{localize(role === "admin" ? "Faculty" : "Program", locale)}</label><Input id="profile-program" key={role} defaultValue={role === "admin" ? "Faculty of Computing" : "Software Engineering"} className="mt-1 h-9" /></div>
            <div><label htmlFor="profile-group" className="text-[12px] text-muted-foreground">{localize(role === "admin" ? "Workspace" : "Group", locale)}</label><Input id="profile-group" key={role} defaultValue={role === "admin" ? "Administration" : "SE-2429"} className="mt-1 h-9" /></div>
          </div>
          <Button size="sm" className="mt-3" onClick={() => toast.success(localize("Profile saved", locale))}>{localize("Save", locale)}</Button>
        </Panel>
        {localize(role === "student" && <Panel title={localize("Availability", locale)}>
          <div className="grid gap-3 md:grid-cols-3">
            <div><label htmlFor="availability-max" className="text-[12px] text-muted-foreground">{localize("Max study hours / day", locale)}</label><Input id="availability-max" type="number" defaultValue={4} className="mt-1 h-9" /></div>
            <div><label htmlFor="availability-start" className="text-[12px] text-muted-foreground">{localize("Earliest start", locale)}</label><Input id="availability-start" type="time" defaultValue="08:00" className="mt-1 h-9" /></div>
            <div><label htmlFor="availability-end" className="text-[12px] text-muted-foreground">{localize("Latest end", locale)}</label><Input id="availability-end" type="time" defaultValue="21:00" className="mt-1 h-9" /></div>
          </div>
        </Panel>, locale)
        }
        <Panel title={localize("AI agent", locale)}>
          <Row title={localize("Proactive insights", locale)} text={localize("Let CampusPulse create recommendations in the background.", locale)} />
          {localize(role === "student" && <Row title={localize("Automatic task generation", locale)} text={localize("Generate Kanban tasks when a new assignment is detected.", locale)} />, locale)}
          {localize(role === "student" && <Row title={localize("Share anonymised completion times", locale)} text={localize("Contribute to historical workload statistics for your course.", locale)} on={false} />, locale)}
        </Panel>
        <Panel title={localize("Notifications", locale)}>
          <Row title={localize("Deadline reminders", locale)} text={localize("48h and 24h before each deadline.", locale)} />
          <Row title={localize("Daily briefing", locale)} text={localize("A summary every morning at 08:00.", locale)} />
          <Row title={localize("Event suggestions", locale)} text={localize("Campus activities that fit your free time.", locale)} on={false} />
        </Panel>
      </div>
    </>
  );
}
