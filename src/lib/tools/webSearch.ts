import { anthropic } from "@ai-sdk/anthropic";

// const webSearchTool = anthropic.tools.webSearch_20260209({
export const webSearchTool = anthropic.tools.webSearch_20250305({
  maxUses: 5,
});
