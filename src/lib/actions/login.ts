"use server";

import { z } from "zod";
import { redirect } from "next/navigation";

const FormSchema = z.object({
  username: z.string(),
  password: z.string(),
});

export async function login(formData: FormData) {
  console.log({ formData });

  const { username } = FormSchema.parse({
    username: formData.get("username"),
    password: formData.get("password"),
  });

  console.info(`User ${username} has logged in`);

  redirect("/chat");
}
