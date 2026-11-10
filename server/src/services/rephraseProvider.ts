import { REPHRASE_PROMPT } from "./rephrasePrompt.js";

export async function requestRephrase(draft, constraints, settings, outputTokens) {
  const signal = AbortSignal.timeout(settings.timeoutMs);
  const requestBody = {
    model: settings.model,
    messages: [
      { role: "system", content: REPHRASE_PROMPT },
      { role: "user", content: JSON.stringify({ draft, constraints: constraints }) },
    ],
    max_tokens: outputTokens,
    temperature: 0.2,
  };
  const responseSchema = {
    type: "object", additionalProperties: false,
    properties: {
      canRephrase: { type: "boolean" },
      reason: { type: "string" },
      options: {
        type: "array",
        items: {
          type: "object", additionalProperties: false,
          properties: { key: { type: "string", enum: ["professional"] }, text: { type: "string" } },
          required: ["key", "text"],
        },
      },
    },
    required: ["canRephrase", "reason", "options"],
  };
  const send = (responseFormat) => fetch(`${settings.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(settings.apiKey ? { authorization: `Bearer ${settings.apiKey}` } : {}) },
    body: JSON.stringify({ ...requestBody, response_format: responseFormat }),
    signal,
  });
  let response = await send({ type: "json_schema", json_schema: { name: "rephrase", strict: true, schema: responseSchema } });
  // Some OpenAI-compatible providers support JSON mode but not JSON schemas.
  if (response.status === 400) response = await send({ type: "json_object" });
  const data = await response.json().catch((error) => {
    if (signal.aborted) throw signal.reason;
    if (error instanceof SyntaxError) return {};
    throw error;
  });
  if (!response.ok) throw new Error(`Provider returned ${response.status}`);
  const choice = data?.choices?.[0];
  if (choice?.finish_reason === "length") throw Object.assign(new Error("The provider cut the rephrase options short. Increase the output token limit and try again."), { status: 502 });
  return choice?.message?.content;
}
