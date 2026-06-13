import { tool } from "ai";
import { z } from "zod";
import { evaluate } from "mathjs";

export const calcTool = tool({
  description:
    "Evaluate a math expression. Use whenever the user needs an exact calculation. " +
    'Supports + - * / ^, parentheses, and functions like sqrt, sin, log, e.g. "(5 + 3) / 2", "sqrt(16)".',
  inputSchema: z.object({
    expression: z.string().describe('A math expression, e.g. "2 + 3 * 4"'),
  }),
  execute: ({ expression }) => {
    try {
      return { expression, result: evaluate(expression) };
    } catch {
      return { error: `Couldn't evaluate "${expression}". Is it valid math?` };
    }
  },
});
