export type DocumentStatus =
  (typeof DocumentStatus)[keyof typeof DocumentStatus];

export const DocumentStatus = {
  pending: "pending",
  processing: "processing",
  success: "success",
  error: "error",
} as const;

