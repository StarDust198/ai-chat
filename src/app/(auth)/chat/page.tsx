import { generateId } from "ai";
import { redirect } from "next/navigation";

export default function Page() {
  redirect(`/chat/${generateId()}`);
}
