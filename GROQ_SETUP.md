# Groq Setup Guide

## Overview

Groq is already integrated into your PigFit AI architecture as a **fallback provider**. This guide walks you through enabling it.

## Architecture

Your AI system uses provider chaining:

- **Primary**: OpenAI (gpt-4o-mini)
- **Fallback**: Groq (llama-3.3-70b-versatile)
- **Secondary Fallback**: Gemini (optional)

When OpenAI fails or is unavailable, the system automatically tries Groq. You can also override this configuration to make Groq primary if preferred.

## Setup Steps

### Step 1: Get a Groq API Key

1. Visit [https://console.groq.com/keys](https://console.groq.com/keys)
2. Sign up or log in with your account
3. Click "Create API Key"
4. Copy your API key (format: `gsk_...`)

### Step 2: Add API Key to `.env` File

The `.env` file has already been created at the project root. Open it and replace the placeholder:

**Before:**

```env
GROQ_API_KEY=gsk_your_groq_api_key_here
```

**After:**

```env
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxx
```

⚠️ **IMPORTANT**: Never commit `.env` files with real API keys to version control. Add `.env` to `.gitignore` if not already there.

### Step 3: Restart Your App

The environment variables are loaded when the app starts:

```bash
npm start
```

Or in a new terminal:

```bash
npx expo start
```

The babel plugin will automatically load your `.env` file and inject the variables at build time.

### Step 4: Verify Setup (Optional)

Run the setup verification test from your project root:

```bash
# Option 1: With ts-node
npx ts-node services/dev/tests/testGroqSetup.ts

# Option 2: With node + dotenv
node -r dotenv/config services/dev/tests/testGroqSetup.ts
```

Expected output:

```
✅ Found GROQ_API_KEY: gsk_...
✅ Config initialized
✅ Groq API key loaded in config
✅ Groq is properly configured as fallback provider
✅ Provider created: groq
✅ API call successful!
✅ Groq Setup Verification Complete!
```

## Configuration

### How to Check Current Configuration

In your app code or tests:

```typescript
import { getAIConfig } from "./services/core/config";

const config = getAIConfig();
console.log(config.deterministicPrimaryProvider); // "openai"
console.log(config.deterministicFallbackProviders); // ["groq"]
```

### How to Switch Groq as Primary Provider

If you want Groq to be the primary provider instead of fallback:

```typescript
import { updateAIConfig } from "./services/core/config";

updateAIConfig({
  deterministicPrimaryProvider: "groq",
});
```

### Available Groq Models

The default model is `llama-3.3-70b-versatile`. You can change it:

```typescript
import { updateAIConfig } from "./services/core/config";

updateAIConfig({
  deterministicModelByProvider: {
    groq: "mixtral-8x7b-32768", // Alternative model
  },
});
```

Other available models:

- `llama-3.3-70b-versatile` (recommended - best quality)
- `mixtral-8x7b-32768`
- Check [Groq Models](https://console.groq.com/docs/models) for latest options

## Files Modified

1. **`.env`** — Created with GROQ_API_KEY placeholder
2. **`babel.config.js`** — Added `react-native-dotenv` plugin to load `.env`

## Testing in Your App

### Deterministic Analysis (Structured Output)

The system uses Groq in:

- `services/ai/deterministic/orchestrator.ts` — Provides fallback for hourly insights and daily assessments
- If OpenAI fails, automatically tries Groq

### RAG Analysis (Streaming)

The system uses Groq in:

- `services/ai/analysis/analyzePigHealth.ts` — Analyzes pig health with context retrieval
- Groq is used directly for streaming responses

## Troubleshooting

### "GROQ_API_KEY not configured"

**Problem**: You see this error even after setting up `.env`

**Solutions**:

1. Verify `.env` file is in the project root (not in a subdirectory)
2. Restart the app: `npm start`
3. Check that `GROQ_API_KEY=gsk_...` is in `.env` (no quotes)
4. Verify you have `react-native-dotenv` in package.json devDependencies
5. Clear Metro cache: `npx expo start --clear`

### "Groq API error 401"

**Problem**: API key is invalid or expired

**Solutions**:

1. Verify your API key is correct in `.env`
2. Check that it starts with `gsk_`
3. Visit [console.groq.com](https://console.groq.com) and regenerate the key if needed

### "API error 429"

**Problem**: Rate limit exceeded

**Solutions**:

- The app implements concurrency limiting (max 3 concurrent Groq requests)
- Wait a moment and retry
- Verify you don't have multiple instances running

### Testing API Connectivity

Test with curl from your terminal:

```bash
# Replace with your actual API key
curl https://api.groq.com/openai/v1/chat/completions \
  -H "Authorization: Bearer gsk_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama-3.3-70b-versatile",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

Should return a response with `choices[0].message.content`.

## Next Steps

1. ✅ Set up API key in `.env`
2. ✅ Restart app with `npm start`
3. ✅ Run analysis (hourly insights, daily assessments)
4. ✅ Monitor logs to see Groq being used
5. (Optional) Switch to Groq as primary if desired

## Support

For issues with:

- **Groq API**: Visit [console.groq.com/docs](https://console.groq.com/docs)
- **React Native dotenv**: Check [react-native-dotenv docs](https://www.npmjs.com/package/react-native-dotenv)
- **Your app**: Check Metro console logs for errors
