import { tool } from "ai";
import { z } from "zod";
import { semanticSearch } from "@/lib/rag/search";

/**
 * Retrieval as a tool rather than as a step before the answer.
 *
 * A factory because the search is per-user and a tool definition is not: `semanticSearch`
 * takes the owner as its second argument, and nothing in the tool call itself carries an
 * identity the way a request does. The route builds the map per request; see
 * lib/tools/index.ts for why a userId-less copy also exists.
 *
 * The model writing the query is the whole point of the tool shape. Retrieval used to
 * embed the raw user turn, which works for a first question and fails for every follow-up
 * — "and what about the second one?" embeds to nothing useful. Here the model resolves
 * the reference before searching, and can search more than once for a compound question.
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
        // A count alone is not a budget: one of these could be a whole table, and a
        // glossary entry is a fortieth of one. maxTokens is the real control; limit is
        // only the cap on how far down the ranking it is worth looking.
        limit: 20,
        maxDistance: 0.6,
        maxTokens: 4000,
      });

      // Only what a citation needs. id, documentId, kind, source, tokenCount and distance
      // stay on SearchMatch for the sources UI to read; none of them mean anything to the
      // model, and every field here is one it has to carry through its context.
      return matches.map((match) => ({
        content: match.content,
        file: match.filename,
        title: match.title,
        // What the page prints on itself wins over the physical index: citing "page 4"
        // for a page numbered iv sends the reader to the wrong place. See Chunk.pageLabel.
        page: match.pageLabel ?? match.page,
        heading: match.heading,
      }));
    },
  });
