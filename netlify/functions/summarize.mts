const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

type PromptType = 'full' | 'actionable' | 'decisions' | 'takeaways' | 'owners';

const QUICK_PROMPTS: Record<Exclude<PromptType, 'full'>, string> = {
  actionable: `Summarize this meeting into actionable bullet points — concrete next steps someone could act on immediately.
Return ONLY valid JSON, no markdown, no code fences:
{ "items": ["action 1", "action 2"] }`,

  decisions: `List every decision that was made or agreed upon in this meeting.
Return ONLY valid JSON, no markdown, no code fences:
{ "items": ["decision 1", "decision 2"] }`,

  takeaways: `Highlight the most important key takeaways from this meeting — insights, conclusions, or things worth remembering.
Return ONLY valid JSON, no markdown, no code fences:
{ "items": ["takeaway 1", "takeaway 2"] }`,

  owners: `Identify every action item and who owns it. If no owner is mentioned, write "Unassigned".
Format each item as "Person: task description".
Return ONLY valid JSON, no markdown, no code fences:
{ "items": ["Alice: send follow-up email", "Bob: schedule next meeting"] }`,
};

// OpenAPI-subset response schemas that force Gemini to emit valid JSON.
const ITEMS_SCHEMA = {
  type: 'object',
  properties: { items: { type: 'array', items: { type: 'string' } } },
  required: ['items'],
};
const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    overview: { type: 'string' },
    decisions: { type: 'array', items: { type: 'string' } },
    actionItems: { type: 'array', items: { type: 'string' } },
    topics: { type: 'array', items: { type: 'string' } },
  },
  required: ['overview', 'decisions', 'actionItems', 'topics'],
};

async function callGemini(apiKey: string, prompt: string, schema: unknown): Promise<string> {
  const geminiRes = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    }),
  });

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    console.error('Gemini API error:', geminiRes.status, errText);
    let detail = `HTTP ${geminiRes.status}`;
    try {
      const errJson = JSON.parse(errText) as { error?: { message?: string } };
      if (errJson.error?.message) detail = errJson.error.message;
    } catch { /* not JSON */ }
    throw new Error(`Gemini API error: ${detail}`);
  }

  const data = await geminiRes.json() as {
    candidates?: {
      content?: { parts?: { text?: string }[] };
      finishReason?: string;
    }[];
  };

  if (data.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
    throw new Error('AI response was truncated. Please try again with a shorter transcript.');
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
}

// Parse model output defensively. JSON mode should make this trivial, but fall
// back to extracting the outermost object; return null instead of throwing.
function safeParseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch { /* fall through */ }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1)) as T;
    } catch { /* fall through */ }
  }
  return null;
}

// Call Gemini and parse; retry once if the first generation can't be parsed.
async function generateJson<T>(apiKey: string, prompt: string, schema: unknown): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const cleaned = await callGemini(apiKey, prompt, schema);
    const parsed = safeParseJson<T>(cleaned);
    if (parsed !== null) return parsed;
  }
  throw new Error("The AI response couldn't be read. Please try again.");
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const { transcript, promptType = 'full', customPrompt } = await req.json() as {
    transcript?: string;
    promptType?: PromptType;
    customPrompt?: string;
  };

  if (!transcript || transcript.trim().length < 50) {
    return json({ error: 'Transcript too short to summarize.' }, 400);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json({ error: 'Gemini API key not configured on server.' }, 500);
  }

  try {
    const trimmedCustomPrompt = customPrompt?.trim();

    if (trimmedCustomPrompt) {
      const prompt = `${trimmedCustomPrompt}\n\nReturn ONLY valid JSON, no markdown, no code fences:\n{ "items": ["item 1", "item 2"] }\n\nTranscript:\n${transcript}`;
      const parsed = await generateJson<{ items?: unknown }>(apiKey, prompt, ITEMS_SCHEMA);
      const items = Array.isArray(parsed?.items) ? parsed.items as string[] : [];
      return json({ items }, 200);
    }

    if (promptType !== 'full') {
      const basePrompt = QUICK_PROMPTS[promptType as Exclude<PromptType, 'full'>];
      const prompt = `${basePrompt}\n\nTranscript:\n${transcript}`;
      const parsed = await generateJson<{ items?: string[] }>(apiKey, prompt, ITEMS_SCHEMA);
      return json({ items: parsed.items ?? [] }, 200);
    }

    // Full analysis (existing behavior)
    const prompt = `You are an expert meeting assistant. Analyze the following meeting transcript and return a JSON object with exactly this structure:

{
  "overview": "2-3 sentence summary of what the meeting was about",
  "decisions": ["decision 1", "decision 2"],
  "actionItems": ["Person: task description", "Person: task description"],
  "topics": ["topic 1", "topic 2", "topic 3"]
}

Rules:
- Return ONLY valid JSON, no markdown, no code fences
- decisions: key conclusions or agreements reached (empty array if none)
- actionItems: specific tasks assigned, include who owns it if mentioned (empty array if none)
- topics: main subjects discussed

Transcript:
${transcript}`;

    const summary = await generateJson<unknown>(apiKey, prompt, SUMMARY_SCHEMA);
    return json({ summary }, 200);
  } catch (err) {
    console.error('Summarize error:', err);
    const message = err instanceof Error ? err.message : "The AI response couldn't be read. Please try again.";
    return json({ error: message }, 500);
  }
};
