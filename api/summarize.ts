import type { VercelRequest, VercelResponse } from '@vercel/node';

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

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

async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const geminiRes = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
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
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { transcript, promptType = 'full' } = req.body as {
    transcript?: string;
    promptType?: PromptType;
  };

  if (!transcript || transcript.trim().length < 50) {
    return res.status(400).json({ error: 'Transcript too short to summarize.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Gemini API key not configured on server.' });
  }

  try {
    if (promptType !== 'full') {
      const basePrompt = QUICK_PROMPTS[promptType as Exclude<PromptType, 'full'>];
      const prompt = `${basePrompt}\n\nTranscript:\n${transcript}`;
      const cleaned = await callGemini(apiKey, prompt);
      const parsed = JSON.parse(cleaned) as { items: string[] };
      return res.status(200).json({ items: parsed.items ?? [] });
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

    const cleaned = await callGemini(apiKey, prompt);
    const summary = JSON.parse(cleaned);
    return res.status(200).json({ summary });
  } catch (err) {
    console.error('Summarize error:', err);
    const message = err instanceof Error ? err.message : 'Failed to parse Gemini response.';
    return res.status(500).json({ error: message });
  }
}
