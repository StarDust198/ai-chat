import { deleteNote } from "@/lib/actions/notes";
import { buttonVariants } from "../ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { ReactElement } from "react";
import { Note } from "@prisma/client";
import { cn } from "@/lib/utils";

export type EditNoteDialogProps = {
  children: ReactElement;
  noteId: Note["id"];
};

export default function DeleteNoteDialog({
  children,
  noteId,
}: EditNoteDialogProps) {
  const deleteNoteWithId = deleteNote.bind(null, noteId);

  return (
    <Dialog>
      <DialogTrigger render={children} />

      <DialogContent className="sm:max-w-sm">
        <form action={deleteNoteWithId}>
          <DialogHeader>
            <DialogTitle>Delete note</DialogTitle>
          </DialogHeader>

          <div className="py-6">Are you sure you want to delete this note?</div>

          <DialogFooter>
            <DialogClose
              type="button"
              className={cn(
                buttonVariants({
                  variant: "secondary",
                }),
              )}
            >
              Cancel
            </DialogClose>

            <DialogClose
              type="submit"
              className={cn(
                buttonVariants({
                  variant: "destructive",
                }),
              )}
            >
              Delete Note
            </DialogClose>

            {/* <Button type="submit" variant="destructive">
              Delete Note
            </Button> */}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
