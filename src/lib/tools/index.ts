import { weatherTool } from "@/lib/tools/weather";
import { calcTool } from "@/lib/tools/calc";
import { webSearchTool } from "@/lib/tools/webSearch";
import { documentSearchTool } from "@/lib/tools/documents";

/**
 * Every tool the model can be given, bound to the user it will run for.
 *
 * Always pass the whole map to streamText and narrow with `activeTools`. Which tools are
 * enabled is a per-request setting, but a saved conversation is permanent: a chat whose
 * history holds a web_search call must still validate and replay on a later turn where
 * web search is switched off. Dropping the tool from the map instead would fail
 * validateUIMessages and leave the provider with a tool_result it has no declaration for.
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
 * The shape of the tool map, for typing and for validating stored messages.
 *
 * Built with an empty userId because nothing in this copy is ever executed: MyTools reads
 * its types, and validateUIMessages reads its input and output schemas. The route builds
 * the real, user-bound map per request. Derived from buildTools rather than written out a
 * second time so the two cannot drift apart.
 */
export const tools = buildTools("");
