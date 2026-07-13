export default async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(null, { status: 405 });
  }

  const token = process.env.DEEPGRAM_API_KEY;
  if (!token) {
    return new Response(JSON.stringify({ error: 'Deepgram API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ token }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};
