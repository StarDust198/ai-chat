"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { NoteSchema } from "@/schemas/message";
import { prisma } from "../prisma";
import { auth } from "@clerk/nextjs/server";

const AddNoteSchema = NoteSchema.omit({
  id: true,
  createdAt: true,
  createdBy: true,
  updatedAt: true,
});

export type NoteFormState = {
  errors?: {
    title?: string[];
    content?: string[];
  };
  message?: string | null;
  success: boolean;
};

export async function addNote(prevState: NoteFormState, formData: FormData) {
  const { isAuthenticated, userId } = await auth();

  if (!isAuthenticated) {
    return {
      message: "Unauthorized",
      success: false,
    };
  }

  const result = AddNoteSchema.safeParse({
    title: formData.get("title"),
    content: formData.get("content"),
  });

  if (!result.success) {
    return {
      errors: z.flattenError(result.error).fieldErrors,
      success: false,
    };
  }

  try {
    await prisma.note.create({
      data: { ...result.data, createdBy: userId },
    });
  } catch {
    return {
      message: "Database Error: Failed to Add Note.",
      success: false,
    };
  }

  revalidatePath("/notes");
  return {
    success: true,
  };
}

const EditNoteSchema = NoteSchema.omit({
  id: true,
  createdAt: true,
  createdBy: true,
  updatedAt: true,
});

export async function editNote(
  id: string,
  prevState: NoteFormState,
  formData: FormData,
) {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    return {
      message: "Unauthorized",
      success: false,
    };
  }

  const result = EditNoteSchema.safeParse({
    title: formData.get("title"),
    content: formData.get("content"),
  });

  if (!result.success) {
    return {
      errors: z.flattenError(result.error).fieldErrors,
      success: false,
    };
  }

  try {
    await prisma.note.update({
      where: {
        id,
      },
      data: result.data,
    });
  } catch {
    return {
      message: "Database Error: Failed to Edit Note.",
      success: false,
    };
  }

  revalidatePath("/notes");
  return {
    success: true,
  };
}

export async function deleteNote(id: string) {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    return {
      message: "Unauthorized",
    };
  }

  try {
    await prisma.note.delete({ where: { id } });
  } catch {
    return {
      message: "Database Error: Failed to Delete Note.",
    };
  }

  revalidatePath("/notes");
}
