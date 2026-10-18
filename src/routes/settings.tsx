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
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Settings — CampusPulse AI" },
      {
        name: "description",
        content: "Profile, availability, agent behaviour and notification preferences.",
      },
      { property: "og:title", content: "Settings — CampusPulse AI" },
      { property: "og:description", content: "Profile, availability and agent preferences." },
    ],
  }),
  component: Settings,
});

const Row = ({
  title,
  text,
  on = true,
  onChange,
}: {
  title: string;
  text: string;
  on?: boolean;
  onChange: (value: boolean) => void;
}) => {
  const { locale } = useI18n();
  return (
  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b py-3 last:border-0">
      <div>
        <div className="text-[13px] font-medium">{localize(title, locale)}</div>
        <div className="text-[12px] text-muted-foreground">{localize(text, locale)}</div>
      </div>
      <Switch
        aria-label={localize(title, locale)}
        checked={on}
        onCheckedChange={(v) => {
          onChange(v);
          toast.success(localize(`${title} ${v ? "enabled" : "disabled"}`, locale));
        }}
      />
  </div>
  );
};

function Settings() {
  const { locale } = useI18n();
  const { role, settings, updateSettings, backendConnected } = useStore();
  const save = async (values: Parameters<typeof updateSettings>[0], message: string) => {
    try {
      await updateSettings(values);
      toast.success(localize(message, locale));
    } catch (error) {
      toast.error(localize("Could not save settings", locale), {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };
  return (
    <>
      <PageHeader
        title={localize("Settings", locale)}
        subtitle={localize("Control how CampusPulse works for you.", locale)}
      />
      <div className="grid max-w-4xl gap-4">
        <Panel title={localize("Language", locale)}>
          <label className="mb-2 block text-[13px]" htmlFor="interface-language">
            {localize("Interface language", locale)}
          </label>
          <LanguageSelector />
        </Panel>
        <Panel title={localize("Profile", locale)}>
          <form
            key={`${role}-${settings.full_name}-${settings.program}-${settings.group_name}`}
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void save(
                {
                  full_name: String(data.get("full_name")),
                  program: String(data.get("program")),
                  group_name: String(data.get("group_name")),
                },
                "Profile saved",
              );
            }}
          >
          <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label htmlFor="profile-name" className="text-[12px] text-muted-foreground">
                  {localize("Name", locale)}
                </label>
                <Input
                  name="full_name"
                  id="profile-name"
                  defaultValue={role === "admin" ? "Academic Admin" : settings.full_name}
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <label htmlFor="profile-program" className="text-[12px] text-muted-foreground">
                  {localize(role === "admin" ? "Faculty" : "Program", locale)}
                </label>
                <Input
                  name="program"
                  id="profile-program"
                  defaultValue={
                    role === "admin" ? "Faculty of Computing" : (settings.program ?? "")
                  }
                  className="mt-1 h-9"
                />
          </div>
              <div>
                <label htmlFor="profile-group" className="text-[12px] text-muted-foreground">
                  {localize(role === "admin" ? "Workspace" : "Group", locale)}
                </label>
                <Input
                  name="group_name"
                  id="profile-group"
                  defaultValue={role === "admin" ? "Administration" : (settings.group_name ?? "")}
                  className="mt-1 h-9"
                />
              </div>
            </div>
            <Button type="submit" size="sm" className="mt-3" disabled={!backendConnected}>
              {localize("Save", locale)}
            </Button>
          </form>
        </Panel>
        {localize(
          role === "student" && (
            <Panel title={localize("Availability", locale)}>
              <form
                key={`${settings.max_study_hours_per_day}-${settings.earliest_start}-${settings.latest_end}`}
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  void save(
                    {
                      max_study_hours_per_day: Number(data.get("max_study_hours_per_day")),
                      earliest_start: String(data.get("earliest_start")),
                      latest_end: String(data.get("latest_end")),
                    },
                    "Availability saved",
                  );
                }}
              >
          <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <label htmlFor="availability-max" className="text-[12px] text-muted-foreground">
                      {localize("Max study hours / day", locale)}
                    </label>
                    <Input
                      name="max_study_hours_per_day"
                      id="availability-max"
                      type="number"
                      step="0.5"
                      defaultValue={settings.max_study_hours_per_day}
                      className="mt-1 h-9"
                    />
          </div>
                  <div>
                    <label
                      htmlFor="availability-start"
                      className="text-[12px] text-muted-foreground"
                    >
                      {localize("Earliest start", locale)}
                    </label>
                    <Input
                      name="earliest_start"
                      id="availability-start"
                      type="time"
                      defaultValue={settings.earliest_start.slice(0, 5)}
                      className="mt-1 h-9"
                    />
                  </div>
                  <div>
                    <label htmlFor="availability-end" className="text-[12px] text-muted-foreground">
                      {localize("Latest end", locale)}
                    </label>
                    <Input
                      name="latest_end"
                      id="availability-end"
                      type="time"
                      defaultValue={settings.latest_end.slice(0, 5)}
                      className="mt-1 h-9"
                    />
                  </div>
                </div>
                <Button type="submit" size="sm" className="mt-3" disabled={!backendConnected}>
                  {localize("Save", locale)}
                </Button>
              </form>
            </Panel>
          ),
          locale,
        )}
        <Panel title={localize("AI agent", locale)}>
          <Row
            title={localize("Proactive insights", locale)}
            text={localize("Let CampusPulse create recommendations in the background.", locale)}
            on={settings.proactive_insights}
            onChange={(value) => void save({ proactive_insights: value }, "Settings saved")}
          />
          {localize(
            role === "student" && (
              <Row
                title={localize("Automatic task generation", locale)}
                text={localize("Generate Kanban tasks when a new assignment is detected.", locale)}
                on={settings.automatic_task_generation}
                onChange={(value) =>
                  void save({ automatic_task_generation: value }, "Settings saved")
                }
              />
            ),
            locale,
          )}
          {localize(
            role === "student" && (
              <Row
                title={localize("Share anonymised completion times", locale)}
                text={localize(
                  "Contribute to historical workload statistics for your course.",
                  locale,
                )}
                on={settings.share_anonymized_completion_times}
                onChange={(value) =>
                  void save({ share_anonymized_completion_times: value }, "Settings saved")
                }
              />
            ),
            locale,
          )}
        </Panel>
        <Panel title={localize("Notifications", locale)}>
          <Row
            title={localize("Deadline reminders", locale)}
            text={localize("48h and 24h before each deadline.", locale)}
            on={settings.deadline_reminders}
            onChange={(value) => void save({ deadline_reminders: value }, "Settings saved")}
          />
          <Row
            title={localize("Daily briefing", locale)}
            text={localize("A summary every morning at 08:00.", locale)}
            on={settings.daily_briefing}
            onChange={(value) => void save({ daily_briefing: value }, "Settings saved")}
          />
          <Row
            title={localize("Event suggestions", locale)}
            text={localize("Campus activities that fit your free time.", locale)}
            on={settings.event_suggestions}
            onChange={(value) => void save({ event_suggestions: value }, "Settings saved")}
          />
        </Panel>
      </div>
    </>
  );
}
