"use client";

import { editNote, NoteFormState } from "@/lib/actions/notes";
import { Button, buttonVariants } from "../ui/button";
import { Field, FieldError, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { ReactElement, useActionState, useState } from "react";
import { Note } from "@prisma/client";
import { cn } from "@/lib/utils";

export type EditNoteDialogProps = {
  children: ReactElement;
  note: Note;
};

export default function EditNoteDialog({
  children,
  note,
}: EditNoteDialogProps) {
  const editNoteWithId = editNote.bind(null, note.id);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);

  const initialState: NoteFormState = {
    message: null,
    errors: {},
    success: false,
  };
  const [state, formAction, isPending] = useActionState(
    async (prev: NoteFormState, formData: FormData) => {
      const result = await editNoteWithId(prev, formData);
      if (result.success) {
        setOpen(false);
      }
      return result;
    },
    initialState,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={children} />

      <DialogContent className="sm:max-w-sm">
        <form action={formAction} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Edit note</DialogTitle>
          </DialogHeader>

          <Field>
            <FieldLabel htmlFor="title">Title</FieldLabel>

            <Input
              name="title"
              id="title"
              type="text"
              placeholder="Enter title"
              aria-describedby="title-error"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isPending}
            />

            <FieldError id="title-error">
              {!!state.errors?.title && state.errors?.title}
            </FieldError>
          </Field>

          <Field>
            <FieldLabel htmlFor="content">Content</FieldLabel>

            <Textarea
              name="content"
              id="content"
              placeholder="Add note content"
              className="min-h-32"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={isPending}
            />
          </Field>

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

            <Button type="submit" disabled={isPending}>
              Save Note
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
