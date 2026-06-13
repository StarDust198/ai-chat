import { tool } from "ai";
import { z } from "zod";

export const weatherTool = tool({
  description:
    "Get current weather for a city. Use when the user asks about weather or conditions in a specific place.",
  inputSchema: z.object({
    location: z.string().describe('City name, e.g. "Yerevan"'),
  }),
  execute: async ({ location }) => {
    try {
      // 1. City name → coordinates
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`,
      );
      const geo = await geoRes.json();
      if (!geo.results?.length) {
        return { error: `Couldn't find "${location}". Check the spelling?` };
      }
      const { latitude, longitude, name, country } = geo.results[0];

      // 2. Coordinates → current weather
      const wxRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code`,
      );
      if (!wxRes.ok)
        return { error: "Weather service is unavailable right now." };
      const wx = await wxRes.json();

      return {
        location: `${name}, ${country}`,
        temperature: wx.current.temperature_2m,
        unit: "°C",
        weatherCode: wx.current.weather_code, // 0 = clear, 3 = overcast, 61 = rain, etc.
      };
    } catch {
      return { error: "Weather service is unavailable right now." };
    }
  },
});
