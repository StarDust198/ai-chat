import { weatherTool } from "@/lib/tools/weather";
import { calcTool } from "@/lib/tools/calc";
import { webSearchTool } from "@/lib/tools/webSearch";
import { documentSearchTool } from "@/lib/tools/documents";

/**
 * Every tool the model can be given, bound to the user it will run for.
 *
 * Always pass the whole map to streamText and narrow with `activeTools`. Enabled tools
 * are per-request but a saved conversation is permanent, so a chat whose history holds a
 * web_search call must still replay on a turn where web search is off. Dropping the tool
 * from the map instead fails validateUIMessages and leaves the provider with a
 * tool_result it has no declaration for.
 */
export const buildTools = (userId: string) => ({
  calc: calcTool,
  weather: weatherTool,
  web_search: {
    ...webSearchTool,
    providerOptions: { cacheControl: { type: "ephemeral" } },
  },
  search_documents: documentSearchTool(userId),
});

/**
 * The shape of the tool map, for typing and for validating stored messages. Nothing in
 * this copy is ever executed — only its types and its schemas are read — hence the empty
 * userId. The route builds the real, user-bound map per request.
 */
export const tools = buildTools("");
