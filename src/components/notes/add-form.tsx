import { addNote } from "@/lib/actions/notes";
import { Button } from "../ui/button";
import { Field, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";

export default function AddNoteForm() {
  return (
    <form action={addNote} className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="title">Title</FieldLabel>

        <Input name="title" id="title" type="text" placeholder="Enter title" />
      </Field>

      <Field>
        <FieldLabel htmlFor="content">Content</FieldLabel>

        <Textarea name="content" id="content" placeholder="Add note content" />
      </Field>

      <Button type="submit">Create Note</Button>
    </form>
  );
}
