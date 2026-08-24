/** Which retrieval tools the model may reach for on this message. */
export type Sources = {
  documents: boolean;
  web: boolean;
};

const SOURCE_KEYS = ["documents", "web"] as const;

const TOOL_NAMES: Record<keyof Sources, string> = {
  documents: "search_documents",
  web: "web_search",
};

const DESCRIPTIONS: Record<keyof Sources, string> = {
  documents:
    "search_documents — the user's own uploaded documents. Use it whenever the question" +
    " could plausibly be answered from them.",
  web:
    "web_search — the public web. Use it for current events, or for anything you would" +
    " otherwise be guessing at.",
};

/**
 * The instructions for one message, given what it is allowed to use. Rebuilt per request
 * and never stored, so nothing here reaches the transcript.
 *
 * Switched-off tools are named rather than omitted. Sources are per-message but history is
 * permanent, so a chat can hold web_search results from before web was switched off; with
 * no account of them the model reads its own past results, offers to search again, and
 * then either stalls or invents the answer.
 *
 * Deliberately not "answer only from the documents" — that instruction fights web search
 * and makes "what's 2+2" report that no information is available.
 */
export const buildSystemPrompt = (sources: Sources) => {
  const off = SOURCE_KEYS.filter((key) => !sources[key]);

  return [
    "You are a helpful assistant. Answer clearly and directly.",

    [
      "Tools you can call now:",
      "- calc — exact arithmetic.",
      "- weather — current conditions for a city.",
      ...SOURCE_KEYS.filter((key) => sources[key]).map(
        (key) => `- ${DESCRIPTIONS[key]}`,
      ),
    ].join("\n"),

    off.length > 0 &&
      [
        "Switched off for this message:",
        ...off.map((key) => `- ${TOOL_NAMES[key]}`),
        "",
        "Do not call these and do not offer to — say the tool is switched off if asked." +
          " Earlier turns may already hold results from one of them; those results are" +
          " still good, so reuse and cite them freely. You simply cannot request new ones.",
      ].join("\n"),

    "Cite every passage you use from search_documents: the document's title (or its file," +
      " when it has no title) and its page.",

    "Answer from your own knowledge when no tool is needed, and say so plainly when a tool" +
      " returns nothing useful rather than inventing an answer.",
  ]
    .filter(Boolean)
    .join("\n\n");
};
