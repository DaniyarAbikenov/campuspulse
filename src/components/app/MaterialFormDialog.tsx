import { useEffect, useRef, useState } from "react";
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
import { updateRemoteMaterial, uploadRemoteMaterial, errorText } from "@/lib/api";
import type { KnowledgeDoc } from "@/lib/data";
import { localize, useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

const KINDS = ["Lecture", "Syllabus", "Other"] as const;

/** Add a lecture, syllabus or other material, or edit its name, type and course. */
export function MaterialFormDialog({
  open,
  onOpenChange,
  material,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  material?: KnowledgeDoc | null;
}) {
  const { locale } = useI18n();
  const { courses, reloadWorkspace } = useStore();
  const [course, setCourse] = useState("");
  const [kind, setKind] = useState<string>("Lecture");
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset only when the dialog opens, never while it is open: store updates must not wipe what is typed.
  const wasOpen = useRef(false);
  useEffect(() => {
    const justOpened = open && !wasOpen.current;
    wasOpen.current = open;
    if (!justOpened) return;
    setCourse(material?.courseId ?? courses[0]?.id ?? "");
    setKind(material ? material.type : "Lecture");
    setName(material?.title ?? "");
    setFile(null);
  }, [open, material, courses]);

  const valid = !!course && (material ? name.trim().length > 0 : !!file);

  const submit = async () => {
    setBusy(true);
    try {
      if (material) {
        await updateRemoteMaterial(material.id, { name: name.trim(), kind, courseId: course });
      } else if (file) {
        const created = await uploadRemoteMaterial({
          file,
          courseId: course,
          kind,
          ...(name.trim() ? { name: name.trim() } : {}),
        });
        if (created.page_count === 0)
          toast.warning(
            localize(
              "Saved, but no text could be read from it (for example a scanned PDF), so it cannot be searched.",
              locale,
            ),
          );
      }
      await reloadWorkspace();
      toast.success(localize(material ? "Material updated" : "Material added", locale));
      onOpenChange(false);
    } catch (error) {
      toast.error(localize("Could not save the material", locale), {
        description: errorText(error),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[16px]">
            {localize(material ? "Edit material" : "Add a material", locale)}
          </DialogTitle>
          <DialogDescription>
            {localize(
              material
                ? "Rename it, change its type or move it to another course."
                : "Its text is read and indexed so the agent can search and cite it.",
              locale,
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!material ? (
            <div className="space-y-1.5">
              <Label htmlFor="mat-file" className="text-[12px]">
                {localize("File (PDF, DOCX or TXT, up to 20 MB)", locale)}
              </Label>
              <Input
                id="mat-file"
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={(event) => {
                  const picked = event.target.files?.[0] ?? null;
                  if (picked && picked.size > 20 * 1024 * 1024) {
                    toast.error(localize("Choose a PDF, DOCX or TXT file up to 20 MB", locale));
                    return;
                  }
                  setFile(picked);
                }}
              />
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mat-course" className="text-[12px]">
                {localize("Course", locale)}
              </Label>
              <Select value={course} onValueChange={setCourse}>
                <SelectTrigger id="mat-course">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mat-kind" className="text-[12px]">
                {localize("Type", locale)}
              </Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger id="mat-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {localize(item, locale)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mat-name" className="text-[12px]">
              {localize(material ? "Name" : "Name (optional, defaults to the file name)", locale)}
            </Label>
            <Input
              id="mat-name"
              value={name}
              maxLength={255}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {localize("Cancel", locale)}
          </Button>
          <Button size="sm" disabled={!valid || busy} onClick={() => void submit()}>
            {localize(material ? "Save changes" : "Add material", locale)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
