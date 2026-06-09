// import type { Note } from "@prisma/client";
import { apiFetch } from "./client";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1";

export type AnthropicModel = {
  type: "model";
  id: string;
  display_name: string;
  created_at: string;
  max_input_tokens: number;
  max_tokens: number;
  capabilities: Record<string, unknown>;
};

export type ModelListResponse = {
  data: AnthropicModel[];
  has_more: boolean;
  first_id: string | null;
  last_id: string | null;
};

export const anthropicApi = {
  getModels: () =>
    apiFetch<ModelListResponse>(`${ANTHROPIC_API_URL}/models`, {
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      next: {
        revalidate: 3600,
      },
    }),
  // list: () => apiFetch<Note[]>("/api/notes"),
  // get: (id: string) => apiFetch<Note>(`/api/notes/${id}`),
  // create: (input: AddNotePayload) =>
  //   apiFetch<Note>("/api/notes", {
  //     method: "POST",
  //     body: JSON.stringify(input),
  //   }),
  // update: (id: string, input: Partial<AddNotePayload>) =>
  //   apiFetch<Note>(`/api/notes/${id}`, {
  //     method: "PATCH",
  //     body: JSON.stringify(input),
  //   }),
  // delete: (id: string) =>
  //   apiFetch<void>(`/api/notes/${id}`, { method: "DELETE" }),
};
