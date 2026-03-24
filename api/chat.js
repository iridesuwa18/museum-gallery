const sleep = ms => new Promise(r => setTimeout(r, ms));

async function callGemini(apiKey, system, content, attempt = 0) {
  // Build Gemini parts from content array
  const parts = [];

  for (const block of content) {
    if (block.type === 'text') {
      parts.push({ text: block.text });
    } else if (block.type === 'image') {
      if (block.source?.type === 'base64') {
        parts.push({
          inlineData: {
            mimeType: block.source.media_type || 'image/jpeg',
            data: block.source.data
          }
        });
      } else if (block.source?.type === 'url') {
        // Fetch image and convert to base64
        const imgRes = await fetch(block.source.url);
        const arrayBuf = await imgRes.arrayBuffer();
        const base64 = Buffer.from(arrayBuf).toString('base64');
        const mime = imgRes.headers.get('content-type') || 'image/jpeg';
        parts.push({ inlineData: { mimeType: mime, data: base64 } });
      }
    }
  }

  const body = {
    system_instruction: { parts: [{ text: system || 'You are a helpful assistant.' }] },
    contents: [{ role: 'user', parts }],
    generationConfig: { maxOutputTokens: 1024, temperature: 0.7 }
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  );

  // Rate limited - retry up to 3 times with increasing delay
  if (res.status === 429 && attempt < 3) {
    const waitMs = (attempt + 1) * 5000; // 5s, 10s, 15s
    await sleep(waitMs);
    return callGemini(apiKey, system, content, attempt + 1);
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const msg = errData?.error?.message || `Gemini API error ${res.status}`;
    throw new Error(msg);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { system, content } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'Missing content' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not set' });
  }

  try {
    const text = await callGemini(GEMINI_API_KEY, system, content);

    // Return in the same shape index.html expects
    return res.status(200).json({
      content: [{ text }]
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
