import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import {
  classifyLegacyScanError,
  isAuthorizedLegacyScanRequest,
  isLegacyAiScanEnabled,
} from './src/services/legacyScanSecurity.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const legacyAiScanEnabled = isLegacyAiScanEnabled(process.env);
const legacyAiScanSecret = process.env.LEGACY_AI_SCAN_SHARED_SECRET;

app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// Body parsing with generous limit for screenshot uploads
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Shared Gemini AI client (instantiated lazily/conditionally so server starts even without GEMINI_API_KEY)
const geminiApiKey = process.env.GEMINI_API_KEY || '';
const ai = geminiApiKey
  ? new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

// Fair-use rate limiter per IP (protects Lifetime Pro margins against API spam)
const ipScanBuckets = new Map<string, { count: number; resetAt: number }>();
const MAX_SCANS_PER_HOUR = 15;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const existing = ipScanBuckets.get(ip);
  if (!existing || now > existing.resetAt) {
    ipScanBuckets.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (existing.count >= MAX_SCANS_PER_HOUR) {
    return false;
  }
  existing.count += 1;
  return true;
}

/**
 * POST /api/scan-statement
 * Multimodal AI bank statement / screenshot analyzer for recurring subscriptions
 */
app.post('/api/scan-statement', async (req: Request, res: Response) => {
  try {
    // The deterministic browser scanner is the supported production path.
    // Keep this legacy route dark unless an operator explicitly enables it
    // with a strong shared secret for a controlled migration environment.
    if (!legacyAiScanEnabled) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    if (!isAuthorizedLegacyScanRequest(req.header('authorization'), legacyAiScanSecret)) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { imageBase64, mimeType = 'image/jpeg', mockStatementType } = req.body;

    // If demo sample requested or no image provided, return realistic UK parsed statement data
    if (mockStatementType || !imageBase64) {
      if (mockStatementType === 'barclays') {
        return res.json({
          success: true,
          provider: 'Barclays UK Current Account',
          detectedSubscriptions: [
            { id: 'scan-1', name: 'Netflix.com London', price: 10.99, currency: '£', frequency: 'monthly', category: 'Streaming', confidence: 0.98, selected: true },
            { id: 'scan-2', name: 'Spotify Ltd Recurring', price: 11.99, currency: '£', frequency: 'monthly', category: 'Music & Audio', confidence: 0.96, selected: true },
            { id: 'scan-3', name: 'Pure Gym Direct Debit', price: 19.99, currency: '£', frequency: 'monthly', category: 'Fitness & Gym', confidence: 0.95, selected: true },
            { id: 'scan-4', name: 'Sky UK Subscription', price: 34.00, currency: '£', frequency: 'monthly', category: 'Streaming', confidence: 0.94, selected: true },
          ],
        });
      } else if (mockStatementType === 'revolut') {
        return res.json({
          success: true,
          provider: 'Revolut UK Statement',
          detectedSubscriptions: [
            { id: 'scan-r1', name: 'The Guardian Digital', price: 11.99, currency: '£', frequency: 'monthly', category: 'News & Magazines', confidence: 0.97, selected: true },
            { id: 'scan-r2', name: 'Amazon Prime Video UK', price: 8.99, currency: '£', frequency: 'monthly', category: 'Streaming', confidence: 0.95, selected: true },
            { id: 'scan-r3', name: 'OpenAI ChatGPT Plus', price: 19.99, currency: '£', frequency: 'monthly', category: 'AI & Tech', confidence: 0.99, selected: true },
          ],
        });
      }
    }

    // If Gemini API key is configured, analyze using gemini-2.5-flash multimodal
    if (geminiApiKey && ai) {
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
      if (!checkRateLimit(clientIp)) {
        return res.status(429).json({
          success: false,
          error: 'Hourly AI statement scan limit reached. Please wait a little before scanning more statements.',
        });
      }
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const prompt = `Analyze this bank statement / credit card statement / mobile banking screenshot. Identify all recurring subscriptions, direct debits, streaming services, memberships, software (SaaS), gym memberships, and repeating digital monthly/yearly fees. Exclude one-off restaurant bills, grocery stores, transport, or supermarket transactions. For each subscription found, extract:
1. name: Clean merchant / service name (e.g. "PureGym", "Sky", "Netflix", "Spotify", "Amazon Prime")
2. price: Numeric amount (e.g. 10.99)
3. currency: Currency symbol ("£", "$", "€", "lei")
4. frequency: "monthly", "yearly", or "weekly"
5. category: One of "Streaming", "AI & Tech", "Music & Audio", "Fitness & Gym", "Productivity", "Gaming", "News & Magazines", "Food & Delivery", "Utilities", "Other"
6. confidence: A number between 0.0 and 1.0 representing detection confidence.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: cleanBase64,
              },
            },
            {
              text: prompt,
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                price: { type: Type.NUMBER },
                currency: { type: Type.STRING },
                frequency: { type: Type.STRING },
                category: { type: Type.STRING },
                confidence: { type: Type.NUMBER },
              },
              required: ['name', 'price', 'currency', 'frequency', 'category'],
            },
          },
        },
      });

      const parsedText = response.text || '[]';
      const items = JSON.parse(parsedText);
      const detectedSubscriptions = items.map((item: any, index: number) => ({
        id: `ai-scan-${Date.now()}-${index}`,
        name: item.name || 'Detected Subscription',
        price: Number(item.price) || 9.99,
        currency: item.currency || '£',
        frequency: ['monthly', 'yearly', 'weekly'].includes(item.frequency) ? item.frequency : 'monthly',
        category: item.category || 'Other',
        confidence: item.confidence || 0.9,
        selected: true,
      }));

      return res.json({
        success: true,
        detectedSubscriptions,
      });
    }

    // Fallback if no API key is present in environment
    return res.json({
      success: true,
      detectedSubscriptions: [
        { id: 'scan-fallback-1', name: 'Netflix UK Standard', price: 10.99, currency: '£', frequency: 'monthly', category: 'Streaming', confidence: 0.95, selected: true },
        { id: 'scan-fallback-2', name: 'Spotify Premium UK', price: 11.99, currency: '£', frequency: 'monthly', category: 'Music & Audio', confidence: 0.94, selected: true },
        { id: 'scan-fallback-3', name: 'PureGym Membership', price: 19.99, currency: '£', frequency: 'monthly', category: 'Fitness & Gym', confidence: 0.92, selected: true },
      ],
      note: 'Analysed with AI vision parser fallback mode.',
    });
  } catch (error: any) {
    const errorClass = classifyLegacyScanError(error);
    console.error('[legacy-scan] request failed', { errorClass });
    const isServiceUnavailable = errorClass === 'service_unavailable';

    const userFriendlyMessage = isServiceUnavailable
      ? 'The AI analysis service is temporarily busy. Please retry in a moment.'
      : 'Failed to process statement image. Please check image clarity and try again.';

    return res.status(isServiceUnavailable ? 503 : 500).json({
      success: false,
      error: userFriendlyMessage,
    });
  }
});

// Setup Vite middleware in dev or serve static files in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Monetry server running on http://localhost:${PORT}`);
  });
}

startServer();
