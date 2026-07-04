import { z } from "zod";

export type Chat = z.infer<typeof ChatSchema>;

export const ChatSchema = z.object({
  id: z.string(),
  title: z.string(),
  userId: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
