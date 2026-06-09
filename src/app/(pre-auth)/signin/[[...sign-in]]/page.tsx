import { SignIn } from "@clerk/nextjs";

export default async function Page() {
  return (
    <div className="p-4 flex w-full grow justify-center items-center">
      <SignIn />
    </div>
  );
}
