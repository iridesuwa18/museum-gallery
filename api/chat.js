const sleep = ms => new Promise(r => setTimeout(r, ms));

// Hardcoded fallback list of known free vision models on OpenRouter
// Used if the live fetch fails or returns nothing
const FALLBACK_MODELS = [
  'nvidia/llama-3.1-nemotron-ultra-253b-v1:free',
  'google/gemma-3-27b-it:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',
  'meta-llama/llama-4-maverick:free',
  'qwen/qwen2.5-vl-72b-instruct:free',
  'google/gemma-3-12b-it:free',
  'mistralai/mistral-small-24b-instruct-2501:free',
];

// Cache the model list in memory for 10 minutes to avoid hammering the models endpoint
let modelCache = { list: null, fetchedAt: 0 };
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function getFreeVisionModels(apiKey) {
  const now = Date.now();

  // Return cached list if still fresh
  if (modelCache.list && (now - modelCache.fetchedAt) < CACHE_TTL) {
    return modelCache.list;
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!res.ok) throw new Error(`Models fetch failed: ${res.status}`);
    const data = await res.json();

    const live = data.data
      .filter(m =>
        m.id.endsWith(':free') &&
        m.architecture?.input_modalities?.includes('image')
      )
      .map(m => m.id);

    if (live.length) {
      modelCache = { list: live, fetchedAt: now };
      return live;
    }
  } catch (err) {
    console.warn('Could not fetch live model list, using fallback:', err.message);
  }

  // Fall back to hardcoded list
  return FALLBACK_MODELS;
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
    // Surface rate limit separately so client can show a clearer message
    if (res.status === 429) throw new Error('RATE_LIMITED');
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

  const { system, content, preferredModel } = req.body;
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

  const models = await getFreeVisionModels(OPENROUTER_API_KEY);
  console.log(`Using ${models.length} free vision models`);

  // If a preferredModel is specified, try it first; otherwise use default order
  const orderedModels = preferredModel
    ? [preferredModel, ...models.filter(m => m !== preferredModel)]
    : models;

  let hitRateLimit = false;

  for (const model of orderedModels) {
    try {
      const { text, usedModel } = await callModel(OPENROUTER_API_KEY, model, system, userContent);
      const modelLabel = usedModel.replace(':free', '').split('/').pop();
      return res.status(200).json({
        content: [{ text }],
        model: modelLabel,
        usedModelId: usedModel,
        availableModels: models
      });
    } catch (err) {
      if (err.message === 'RATE_LIMITED') {
        hitRateLimit = true;
        console.log(`Model ${model} rate limited, trying next...`);
      } else {
        console.log(`Model ${model} failed: ${err.message}, trying next...`);
      }
      await sleep(300);
    }
  }

  const errorMsg = hitRateLimit
    ? 'You\'ve hit the OpenRouter free daily limit (50 req/day). Wait until tomorrow or add credits at openrouter.ai.'
    : 'All free AI models are currently busy. Please try again in a moment.';

  return res.status(429).json({ error: errorMsg });
}
