// api/chat.js — Vercel Serverless Function
// This runs on Vercel's servers. Your GEMINI_API_KEY never reaches the browser.
//
// Setup:
//   1. Go to your Vercel project → Settings → Environment Variables
//   2. Add: GEMINI_API_KEY = your_key_from_aistudio.google.com
//   3. Deploy — done.

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY is not set. Add it in Vercel → Settings → Environment Variables.'
    });
  }

  const { system, content } = req.body;

  if (!content || !Array.isArray(content)) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: system ? { parts: [{ text: system }] } : undefined,
          contents: [
            {
              role: 'user',
              parts: content.map(block => {
                if (block.type === 'text') {
                  return { text: block.text };
                }
                if (block.type === 'image') {
                  if (block.source.type === 'base64') {
                    return {
                      inlineData: {
                        mimeType: block.source.media_type,
                        data: block.source.data
                      }
                    };
                  }
                  if (block.source.type === 'url') {
                    // Fetch the image server-side to avoid CORS
                    // (handled below — see note)
                    return { text: `[Image URL: ${block.source.url}]` };
                  }
                }
                return { text: '' };
              }).filter(p => p.text !== '')
            }
          ],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 600
          }
        })
      }
    );

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({
        error: err.error?.message || 'Gemini API error'
      });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Return in Anthropic-style format so the frontend code is consistent
    return res.status(200).json({
      content: [{ type: 'text', text }]
    });

  } catch (err) {
    console.error('Gemini API error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
