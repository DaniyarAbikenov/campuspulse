import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { campusInputs, createRemoteCampusEvent, updateRemoteCampusEvent } from "@/lib/api";
import type { CampusEvent } from "@/lib/data";
import { localize, useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { addDays } from "@/lib/week";

export const EVENT_CATEGORIES = ["Tech", "Academic", "Career", "Sports", "Social"] as const;

/** Create a campus event, or edit one you added (administrators can edit any). */
export function EventFormDialog({
  open,
  onOpenChange,
  event,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: CampusEvent | null;
}) {
  const { locale } = useI18n();
  const { today, reloadWorkspace } = useStore();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("Academic");
  const [place, setPlace] = useState("");
  const [date, setDate] = useState(today);
  const [start, setStart] = useState("16:00");
  const [end, setEnd] = useState("18:00");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (event?.startsAt && event.endsAt) {
      const from = campusInputs(event.startsAt);
      setTitle(event.title);
      setCategory(event.category);
      setPlace(event.place);
      setDate(from.date);
      setStart(from.time);
      setEnd(campusInputs(event.endsAt).time);
      setDescription(event.description ?? "");
    } else {
      setTitle("");
      setCategory("Academic");
      setPlace("");
      setDate(addDays(today, 1));
      setStart("16:00");
      setEnd("18:00");
      setDescription("");
    }
  }, [open, event, today]);

  const valid = title.trim() && place.trim() && date && end > start;

  const submit = async () => {
    setBusy(true);
    const input = {
      title: title.trim(),
      category,
      place: place.trim(),
      date,
      start,
      end,
      description: description.trim(),
    };
    try {
      if (event?.backendId) await updateRemoteCampusEvent(event.backendId, input);
      else await createRemoteCampusEvent(input);
      await reloadWorkspace();
      toast.success(localize(event ? "Event updated" : "Event added", locale));
      onOpenChange(false);
    } catch (error) {
      toast.error(localize("Could not save the event", locale), {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[16px]">
            {localize(event ? "Edit event" : "Add a campus event", locale)}
          </DialogTitle>
          <DialogDescription>
            {localize("Visible to everyone at your institution.", locale)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ev-title" className="text-[12px]">
              {localize("Title", locale)}
            </Label>
            <Input
              id="ev-title"
              value={title}
              maxLength={240}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ev-category" className="text-[12px]">
                {localize("Category", locale)}
              </Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="ev-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_CATEGORIES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {localize(item, locale)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-place" className="text-[12px]">
                {localize("Place", locale)}
              </Label>
              <Input
                id="ev-place"
                value={place}
                maxLength={240}
                onChange={(e) => setPlace(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ev-date" className="text-[12px]">
                {localize("Date", locale)}
              </Label>
              <Input
                id="ev-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-start" className="text-[12px]">
                {localize("From", locale)}
              </Label>
              <Input
                id="ev-start"
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-end" className="text-[12px]">
                {localize("To", locale)}
              </Label>
              <Input id="ev-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-description" className="text-[12px]">
              {localize("Description (optional)", locale)}
            </Label>
            <Textarea
              id="ev-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {localize("Cancel", locale)}
          </Button>
          <Button size="sm" disabled={!valid || busy} onClick={() => void submit()}>
            {localize(event ? "Save changes" : "Add event", locale)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
