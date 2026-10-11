import { buildSummaryPrompt } from "./summaryPrompt.js";

function summaryError(status, message) {
  return Object.assign(new Error(message), { status });
}

function messageContext(message) {
  let text = String(message.body || "").replace(/@everyone\b/gi, "").trim();
  text = text.replace(/@group\.([a-z0-9_-]+)\.([a-f0-9]{24})/gi, (_, provider, id) => {
    const group = message.mentionedGroups?.find((group) => group.id === id && group.provider === provider);
    return group ? `${group.name} group` : "a mentioned group";
  });
  return {
    sentAt: message.createdAt,
    author: message.author?.displayName || message.author?.username || "Unknown participant",
    text,
    attachments: (message.attachments || []).map((attachment) => ({ name: attachment.name || attachment.originalName || "Attachment" })),
  };
}

export async function summarizeThreadDiscussion(thread, settings) {
  const replies = thread.replies.filter((message) => !message.deleted && (message.body?.trim() || message.attachments?.length));
  if (!replies.length) throw summaryError(400, "This thread has no replies to summarize.");
  const systemPrompt = buildSummaryPrompt(settings.prompt);
  const input = JSON.stringify({
    originalPost: thread.root.deleted ? { text: "Original post deleted." } : messageContext(thread.root),
    replies: replies.map(messageContext),
  });
  // Conservative estimate for mixed-language text; reserve room for instructions
  // and output. Reject rather than silently omit the beginning or resolution.
  if (Math.ceil((input.length + systemPrompt.length) / 3) + settings.maxOutputTokens > settings.maxContextTokens) {
    throw summaryError(413, "This thread exceeds the configured context budget. Increase the context limit to summarize it in full.");
  }
  const body = { model: settings.model, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: input }], max_tokens: settings.maxOutputTokens, temperature: 0 };
  const signal = AbortSignal.timeout(settings.timeoutMs);
  const response = await fetch(`${settings.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(settings.apiKey ? { authorization: `Bearer ${settings.apiKey}` } : {}) },
    body: JSON.stringify(body),
    signal,
  });
  const data = await response.json().catch((error) => {
    if (signal.aborted) throw signal.reason;
    if (error instanceof SyntaxError) return {};
    throw error;
  });
  if (!response.ok) throw new Error(`Provider returned ${response.status}`);
  const choice = data?.choices?.[0];
  if (choice?.finish_reason === "length") throw summaryError(502, "The provider cut the summary short. Increase the output token limit and try again.");
  if (typeof choice?.message?.content !== "string" || !choice.message.content.trim()) throw new Error("Provider returned an empty summary");
  const summary = choice.message.content.trim().replace(/^```(?:text|plaintext|markdown|md)?\s*/i, "").replace(/\s*```$/, "").trim();
  if (!summary) throw new Error("Provider returned an empty summary");
  return { summary, replyCount: replies.length, generatedAt: new Date().toISOString() };
}
