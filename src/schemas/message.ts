import { z } from "zod";

export const FormMessageSchema = z.object({
  content: z.string().trim().min(1, { message: "Message content is required" }),
  model: z.string(),
});

// export const NoteSchema = z.object({
//   id: z.string(),
//   title: z
//     .string()
//     .trim()
//     .min(1, { message: "Title is required" })
//     .max(100, { message: "Title could not be longer than 100 symbols" }),
//   content: z.string(),
//   createdBy: z.string(),
//   createdAt: z.coerce.date(),
//   updatedAt: z.coerce.date(),
// });
