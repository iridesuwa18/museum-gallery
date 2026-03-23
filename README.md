# The Gallery — AI Museum Experience

A beautiful, museum-quality web experience where you can explore any artwork with an AI gallery curator.

## Features
- **Ornate picture frame** — loads images via upload, URL, paste, or drag & drop
- **AI Gallery Assistant (Marguerite)** — analyses artwork across 10 art history categories
- **Art Finder** — search 400,000+ real works from the Met Museum & Art Institute of Chicago
- **Secure API** — your Gemini key is hidden on Vercel's servers

## Setup (5 minutes)

### 1. Get a free Gemini API key
Go to [aistudio.google.com](https://aistudio.google.com) → Get API Key → Create API Key.

### 2. Push this folder to GitHub
Create a new GitHub repository and push these files to it.

### 3. Deploy to Vercel
1. Go to [vercel.com](https://vercel.com) and connect your GitHub account
2. Click **New Project** → import your repository
3. Go to **Settings → Environment Variables**
4. Add: `GEMINI_API_KEY` = your key from step 1
5. Click **Deploy**

That's it — your gallery is live and your API key is completely hidden.

## Project Structure
```
/
├── index.html          ← The full museum UI
├── api/
│   └── chat.js         ← Vercel serverless function (hides your API key)
├── vercel.json         ← Vercel routing config
└── README.md
```

## Using the Gallery
- **Gallery tab** — Load an artwork, then use the analysis panel on the right
- **Art Finder tab** — Search real museum collections and click any result to load it into the frame
- **Categories** — Click any of the 10 art history categories for focused analysis
- **Ask freely** — Type any question about the artwork in the input box

## APIs Used (all free, no key needed)
- [Metropolitan Museum of Art](https://metmuseum.github.io/) — 400,000+ works
- [Art Institute of Chicago](https://api.artic.edu/docs/) — 100,000+ works
- [Google Gemini 2.0 Flash](https://aistudio.google.com) — Vision AI (free tier: 1,000 req/day)
