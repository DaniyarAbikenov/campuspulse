import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { localize, useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { addDays, mondayOf } from "@/lib/week";

/** Moves the whole workspace (schedule, workload, overview) to another calendar week. */
export function WeekSwitcher() {
  const { locale } = useI18n();
  const { weekStart, today, selectWeek, backendConnected } = useStore();
  if (!backendConnected) return null;
  const thisWeek = mondayOf(today);
  return (
    <div className="flex items-center gap-1" role="group" aria-label={localize("Week", locale)}>
      <Button size="icon" variant="outline" className="h-8 w-8" aria-label={localize("Previous week", locale)} onClick={() => void selectWeek(addDays(weekStart, -7))}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button size="sm" variant="outline" className="h-8" disabled={weekStart === thisWeek} onClick={() => void selectWeek(thisWeek)}>
        {localize("This week", locale)}
      </Button>
      <Button size="icon" variant="outline" className="h-8 w-8" aria-label={localize("Next week", locale)} onClick={() => void selectWeek(addDays(weekStart, 7))}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
