import axios from "axios";

const OLLAMA_BASE_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5";

/**
 * Builds the strict extraction prompt for Ollama.
 */
function buildPrompt(text) {
  return `You are a data extraction engine. Your ONLY job is to read the document text below and return a single, valid JSON object.

STRICT RULES:
- Output ONLY raw JSON. No markdown. No code fences. No explanations. No extra text.
- Never hallucinate data. If a field is not present in the text, use null.
- All monetary amounts must be numbers (not strings).
- Dates must be ISO 8601 strings (YYYY-MM-DD) where possible.
- The "items" field must be an array of objects, each with: { description, quantity, unitPrice, total }.

JSON SCHEMA TO FOLLOW:
{
  "vendor": string | null,
  "date": string | null,
  "invoiceNumber": string | null,
  "name": string | null,
  "amount": number | null,
  "currency": string | null,
  "taxAmount": number | null,
  "subtotal": number | null,
  "items": [
    {
      "description": string,
      "quantity": number | null,
      "unitPrice": number | null,
      "total": number | null
    }
  ],
  "paymentMethod": string | null,
  "dueDate": string | null,
  "address": string | null,
  "summary": string | null
}

DOCUMENT TEXT:
---
${text.slice(0, 6000)}
---

JSON OUTPUT:`;
}

/**
 * Sends text to Ollama and returns parsed structured JSON.
 * @param {string} text - Extracted document text.
 * @returns {Promise<object>} - Structured data object.
 */
export async function queryOllama(text) {
  const prompt = buildPrompt(text);

  let response;
  try {
    response = await axios.post(
      `${OLLAMA_BASE_URL}/api/generate`,
      {
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: {
          temperature: 0.1,
          top_p: 0.9,
          num_predict: 1024,
        },
      },
      { timeout: 120_000 }
    );
  } catch (err) {
    if (err.code === "ECONNREFUSED") {
      throw new Error(
        `Cannot connect to Ollama at ${OLLAMA_BASE_URL}. ` +
        `Make sure Ollama is running: ollama serve`
      );
    }
    throw new Error(`Ollama request failed: ${err.message}`);
  }

  const raw = response.data?.response || "";
  return parseJsonFromResponse(raw);
}

/**
 * Robustly parse JSON from LLM output (handles fences, whitespace, etc.)
 */
function parseJsonFromResponse(raw) {
  // Strip markdown code fences if present
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  // Find the first { and last } to isolate the JSON object
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1) {
    throw new Error("Ollama did not return a valid JSON object. Raw output: " + raw.slice(0, 300));
  }

  const jsonStr = cleaned.slice(start, end + 1);

  try {
    return JSON.parse(jsonStr);
  } catch (parseErr) {
    throw new Error(
      `Failed to parse JSON from Ollama response: ${parseErr.message}.\n` +
      `Raw snippet: ${jsonStr.slice(0, 300)}`
    );
  }
}
