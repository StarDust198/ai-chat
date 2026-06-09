import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Button } from "../ui/button";
import { prisma } from "@/lib/prisma";
import EditNoteDialog from "./edit-dialog";
import DeleteNoteDialog from "./delete-dialog";
import { cn } from "@/lib/utils";
import { auth } from "@clerk/nextjs/server";

interface CardListProps {
  className?: string;
}

export default async function CardList({ className }: CardListProps) {
  const { userId, isAuthenticated } = await auth();

  if (!isAuthenticated) throw Error();

  const notes = await prisma.note.findMany({
    where: {
      createdBy: userId,
    },
    orderBy: { createdAt: "desc" },
  });

  const renderNotes = () => {
    if (notes.length) {
      return notes.map((note) => (
        <Card key={note.id} className="min-h-80">
          <CardHeader>
            <CardTitle>{note.title}</CardTitle>
            <CardDescription>
              {new Intl.DateTimeFormat("en-US", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              }).format(note.createdAt)}
            </CardDescription>
          </CardHeader>

          <CardContent className="grow">
            <p className="whitespace-pre-wrap">{note.content}</p>
          </CardContent>

          <CardFooter className="gap-2">
            <EditNoteDialog note={note}>
              <Button variant="secondary">Edit note</Button>
            </EditNoteDialog>

            <DeleteNoteDialog noteId={note.id}>
              <Button variant="destructive">Delete note</Button>
            </DeleteNoteDialog>

            {/* <Link
              href={`/notes/edit/${note.id}`}
              className={cn(
                buttonVariants({
                  variant: "secondary",
                }),
              )}
            >
              Edit note
            </Link>

            <Link
              href={`/notes/delete/${note.id}`}
              className={cn(
                buttonVariants({
                  variant: "destructive",
                }),
              )}
            >
              Delete note
            </Link> */}
          </CardFooter>
        </Card>
      ));
    }

    return (
      <div className="py-2">No notes found. Create your first note! :)</div>
    );
  };

  return (
    <div
      className={cn(
        "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 auto-rows-min",
        className,
      )}
    >
      {renderNotes()}
    </div>
  );
}
