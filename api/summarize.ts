import type { VercelRequest, VercelResponse } from '@vercel/node';

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { transcript } = req.body as { transcript?: string };

  if (!transcript || transcript.trim().length < 50) {
    return res.status(400).json({ error: 'Transcript too short to summarize.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Gemini API key not configured on server.' });
  }

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

  try {
    const geminiRes = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API error:', errText);
      return res.status(502).json({ error: 'Gemini API request failed.' });
    }

    const data = await geminiRes.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    // Strip any accidental markdown code fences
    const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();

    const summary = JSON.parse(cleaned);
    return res.status(200).json({ summary });
  } catch (err) {
    console.error('Summarize error:', err);
    return res.status(500).json({ error: 'Failed to parse Gemini response.' });
  }
}
