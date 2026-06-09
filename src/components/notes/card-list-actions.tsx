import { PencilSquareIcon } from "@heroicons/react/16/solid";
import { Button } from "../ui/button";
import AddNoteDialog from "./add-dialog";
import { cn } from "@/lib/utils";

interface CardListActionsProps {
  className?: string;
}

export default async function CardListActions({
  className,
}: CardListActionsProps) {
  return (
    <div className={cn("flex gap-2", className)}>
      <AddNoteDialog>
        <Button variant="default">
          <PencilSquareIcon />

          <div>New note</div>
        </Button>
      </AddNoteDialog>
    </div>
  );
}
