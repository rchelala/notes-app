import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = process.env.DEEPGRAM_API_KEY;
  if (!token) {
    return res.status(500).json({ error: 'Deepgram API key not configured' });
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ token });
}
