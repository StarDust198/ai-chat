import { tool } from "ai";
import { z } from "zod";
import { semanticSearch } from "@/lib/rag/search";

/**
 * Retrieval as a tool rather than as a step before the answer, so the model writes the
 * query itself: it resolves "and what about the second one?" against the conversation
 * before searching, and can search more than once for a compound question.
 *
 * A factory because the search is per-user and a tool definition is not — nothing in a
 * tool call carries an identity the way a request does.
 */
export const documentSearchTool = (userId: string) =>
  tool({
    description:
      "Search the user's uploaded document library for passages relevant to a question. " +
      "Pass a self-contained query: this tool matches on meaning and sees only the text " +
      "you give it, never the conversation, so resolve references first " +
      '("the second one" -> "the Professional plan rate limit"). ' +
      "Returns the best-matching passages with the document and page each came from.",
    inputSchema: z.object({
      query: z
        .string()
        .describe("A self-contained description of what to find"),
    }),
    execute: async ({ query }) => {
      const matches = await semanticSearch(query, userId, {
        // maxTokens is the real budget — a match could be a whole table or a one-line
        // glossary entry. limit only caps how far down the ranking it is worth looking.
        limit: 20,
        maxDistance: 0.6,
        maxTokens: 4000,
      });

      // Only what a citation needs: every other field on SearchMatch means nothing to the
      // model and would just occupy its context.
      return matches.map((match) => ({
        content: match.content,
        file: match.filename,
        title: match.title,
        // What the page prints on itself wins over the physical index: citing "page 4"
        // for a page numbered iv sends the reader to the wrong place.
        page: match.pageLabel ?? match.page,
        heading: match.heading,
      }));
    },
  });
