import { weatherTool } from "@/lib/tools/weather";
import { calcTool } from "@/lib/tools/calc";
import { webSearchTool } from "@/lib/tools/webSearch";

export const tools = {
  calc: calcTool,
  weather: weatherTool,
  web_search: {
    ...webSearchTool,
    providerOptions: { cacheControl: { type: "ephemeral" } },
  },
};
