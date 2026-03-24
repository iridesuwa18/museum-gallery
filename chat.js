const sleep = ms => new Promise(r => setTimeout(r, ms));

// Fetch live list of free vision-capable models from OpenRouter
async function getFreevisionModels(apiKey) {
  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  if (!res.ok) return [];
  const data = await res.json();

  return data.data
    .filter(m =>
      m.id.endsWith(':free') &&
      m.architecture?.input_modalities?.includes('image')
    )
    .map(m => m.id);
}

async function callModel(apiKey, model, system, userContent) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://gallery-seven.vercel.app',
      'X-Title': 'The Gallery'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system || 'You are a helpful assistant.' },
        { role: 'user',   content: userContent }
      ],
      max_tokens: 1024,
      temperature: 0.7
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Error ${res.status}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('Empty response');
  return { text, usedModel: data.model || model };
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

  // Preferred models — better pop culture recall and instruction following
  const PREFERRED = [
    'meta-llama/llama-4-maverick:free',
    'google/gemma-3-27b-it:free',
    'mistralai/mistral-small-3.1-24b-instruct:free',
  ];

  // Get live list, put preferred first, use rest as fallback
  const live = await getFreevisionModels(OPENROUTER_API_KEY);
  const models = [...PREFERRED, ...live.filter(m => !PREFERRED.includes(m))];
  console.log('Model queue:', models);

  if (!models.length) {
    return res.status(500).json({ error: 'No free vision models available right now. Please try again shortly.' });
  }

  // Try each model until one works
  for (const model of models) {
    try {
      const { text, usedModel } = await callModel(OPENROUTER_API_KEY, model, system, userContent);
      const modelLabel = usedModel.replace(':free', '').split('/').pop();
      return res.status(200).json({
        content: [{ text }],
        model: modelLabel
      });
    } catch (err) {
      console.log(`Model ${model} failed: ${err.message}, trying next...`);
      await sleep(300);
    }
  }

  return res.status(500).json({ error: 'All free AI models are currently busy. Please try again shortly.' });
}
