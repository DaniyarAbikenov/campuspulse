import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Ban, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cancelRemoteAssignment, deleteRemoteAssignment, reopenRemoteAssignment, errorText } from "@/lib/api";
import type { Assignment } from "@/lib/data";
import { localize, useI18n } from "@/lib/i18n";
import { useStore } from "@/lib/store";

/** Cancel, reopen or delete an assignment; its subtasks follow it. */
export function AssignmentActions({ assignment }: { assignment: Assignment }) {
  const { locale } = useI18n();
  const navigate = useNavigate();
  const { backendConnected, reloadWorkspace } = useStore();
  const [confirm, setConfirm] = useState<"cancel" | "delete" | null>(null);
  if (!backendConnected || !assignment.backendId) return null;
  const id = assignment.backendId;
  const cancelled = assignment.status === "Cancelled";

  const run = async (action: "cancel" | "reopen" | "delete") => {
    try {
      if (action === "reopen") {
        await reopenRemoteAssignment(id);
        await reloadWorkspace();
        toast.success(localize("Assignment reopened", locale));
        return;
      }
      const result = await (action === "cancel"
        ? cancelRemoteAssignment(id)
        : deleteRemoteAssignment(id));
      await reloadWorkspace();
      toast.success(
        localize(action === "cancel" ? "Assignment cancelled" : "Assignment deleted", locale),
        {
          description: `${result.removedTasks} ${localize("tasks and", locale)} ${result.removedSessions} ${localize("study sessions removed", locale)}`,
        },
      );
      if (action === "delete") void navigate({ to: "/assignments" });
    } catch (error) {
      toast.error(localize("That did not work", locale), {
        description: errorText(error),
      });
    } finally {
      setConfirm(null);
    }
  };

  return (
    <>
      {cancelled ? (
        <Button size="sm" variant="outline" onClick={() => void run("reopen")}>
          <RotateCcw className="h-3.5 w-3.5" /> {localize("Reopen", locale)}
        </Button>
      ) : assignment.status !== "Completed" ? (
        <Button size="sm" variant="outline" onClick={() => setConfirm("cancel")}>
          <Ban className="h-3.5 w-3.5" /> {localize("Cancel assignment", locale)}
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        className="text-destructive"
        onClick={() => setConfirm("delete")}
      >
        <Trash2 className="h-3.5 w-3.5" /> {localize("Delete", locale)}
      </Button>
      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {localize(
                confirm === "delete" ? "Delete this assignment?" : "Cancel this assignment?",
                locale,
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {localize(
                confirm === "delete"
                  ? "The assignment, all its tasks, their study sessions and the uploaded brief are removed for good."
                  : "It is marked cancelled and leaves your deadlines and workload. Unfinished tasks and their future study sessions are removed; finished tasks stay. You can reopen it later.",
                locale,
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{localize("Keep it", locale)}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void run(confirm === "delete" ? "delete" : "cancel")}>
              {localize(confirm === "delete" ? "Delete" : "Cancel assignment", locale)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
