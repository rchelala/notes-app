import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = process.env.DEEPGRAM_API_KEY;
  if (!token) {
    console.error('[deepgram-token] DEEPGRAM_API_KEY is not set. Available env keys:', Object.keys(process.env).filter(k => !k.startsWith('npm_')));
    return res.status(500).json({ error: 'Deepgram API key not configured' });
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ token });
}
