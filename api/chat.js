const FREE_VISION_MODELS = [
  'google/gemma-3-27b-it:free',
  'google/gemma-3-12b-it:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',
  'meta-llama/llama-4-maverick:free',
  'qwen/qwen2.5-vl-72b-instruct:free',
  null // null = let OpenRouter pick any available free model
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function tryModel(apiKey, model, system, userContent) {
  const body = {
    messages: [
      { role: 'system', content: system || 'You are a helpful assistant.' },
      { role: 'user',   content: userContent }
    ],
    max_tokens: 1024,
    temperature: 0.7
  };

  // Only set model if we have one — otherwise OpenRouter picks automatically
  if (model) body.model = model;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://gallery-seven.vercel.app',
      'X-Title': 'The Gallery'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Error ${res.status}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  const usedModel = data.model || model || 'auto';
  if (!text) throw new Error('Empty response');
  return { text, usedModel };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { system, content } = req.body;
  if (!content) return res.status(400).json({ error: 'Missing content' });

  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY is not set' });

  // Build OpenRouter compatible content array (supports text + image)
  let userContent;
  if (Array.isArray(content)) {
    userContent = content.map(block => {
      if (block.type === 'text') {
        return { type: 'text', text: block.text };
      } else if (block.type === 'image') {
        if (block.source?.type === 'base64') {
          return {
            type: 'image_url',
            image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` }
          };
        } else if (block.source?.type === 'url') {
          return { type: 'image_url', image_url: { url: block.source.url } };
        }
      }
      return null;
    }).filter(Boolean);
  } else {
    userContent = String(content);
  }

  // Try each model in order, fall back to next on failure
  for (const model of FREE_VISION_MODELS) {
    try {
      const { text, usedModel } = await tryModel(OPENROUTER_API_KEY, model, system, userContent);
      const modelLabel = usedModel.replace(':free', '').split('/').pop();
      return res.status(200).json({
        content: [{ text }],
        model: modelLabel
      });
    } catch (err) {
      console.log(`Model ${model || 'auto'} failed: ${err.message}, trying next...`);
      await sleep(300);
    }
  }

  return res.status(500).json({ error: 'All AI models are currently unavailable. Please try again shortly.' });
}
