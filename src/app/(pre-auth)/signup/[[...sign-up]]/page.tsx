import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="p-4 flex w-full grow justify-center items-center">
      <SignUp />
    </div>
  );
}
