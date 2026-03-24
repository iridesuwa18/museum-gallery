export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { system, content } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'Missing content' });
  }

  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY is not set' });
  }

  // Build message content - supports both text and image URLs
  let userContent;
  if (Array.isArray(content)) {
    userContent = content.map(block => {
      if (block.type === 'text') {
        return { type: 'text', text: block.text };
      } else if (block.type === 'image' && block.source?.url) {
        return {
          type: 'image_url',
          image_url: { url: block.source.url }
        };
      }
      return null;
    }).filter(Boolean);
  } else {
    userContent = String(content);
  }

  try {
    const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://gallery-seven.vercel.app',
        'X-Title': 'The Gallery'
      },
      body: JSON.stringify({
        model: 'openrouter/free',
        messages: [
          { role: 'system', content: system || 'You are a helpful assistant.' },
          { role: 'user',   content: userContent }
        ],
        max_tokens: 1024,
        temperature: 0.7
      })
    });

    if (!orRes.ok) {
      const errData = await orRes.json().catch(() => ({}));
      return res.status(orRes.status).json({
        error: errData?.error?.message || 'OpenRouter API error'
      });
    }

    const data = await orRes.json();
    const text = data.choices?.[0]?.message?.content || '';

    // Return in the same shape index.html expects: { content: [{ text }] }
    return res.status(200).json({
      content: [{ text }]
    });

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
