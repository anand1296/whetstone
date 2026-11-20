const PROMPT_OPEN = '<aside class="callout callout-prompt">';
const HINT_OPEN = '<aside class="callout callout-hint">';
const ASIDE_CLOSE = '</aside>';

/** Cuts one leading callout of the given kind off `html`; both renderers emit callouts at top level and they don't nest. */
function takeCallout(html: string, open: string): { callout: string; rest: string } | null {
  const start = html.trimStart();
  if (!start.startsWith(open)) return null;
  const end = start.indexOf(ASIDE_CLOSE);
  if (end === -1) return null;
  const cut = end + ASIDE_CLOSE.length;
  return { callout: start.slice(0, cut), rest: start.slice(cut) };
}

/**
 * Splits the optional leading `> [!PROMPT]` callout (the full question) and the optional `> [!HINT]` callout
 * that follows it from the rest of an answer. The hint is kept apart so it can stay behind a button until
 * the reader asks for it: what a strong answer covers is not something an interviewer says up front.
 */
export function splitPrompt(html: string): { prompt: string; hint: string; rest: string } {
  const prompt = takeCallout(html, PROMPT_OPEN);
  if (!prompt) return { prompt: '', hint: '', rest: html };
  const hint = takeCallout(prompt.rest, HINT_OPEN);
  if (!hint) return { prompt: prompt.callout, hint: '', rest: prompt.rest };
  return { prompt: prompt.callout, hint: hint.callout, rest: hint.rest };
}
