const SYSTEM_PROMPT = `你是一位生酮飲食分析師。請分析這張圖片中的食物或營養標籤。
只回傳一個合法 JSON 物件，不要包含任何其他文字、說明、markdown 或 code block。

JSON 格式如下（所有數字欄位必須為數字，不要是文字）：
{
  "food_name": "食物名稱（繁體中文）",
  "estimated_serving": "份量說明",
  "calories": 0,
  "fat_g": 0,
  "protein_g": 0,
  "carb_g": 0,
  "fiber_g": 0,
  "keto_risk": "low",
  "confidence": "high",
  "notes": "備註（繁體中文）"
}

規則：
- 必須輸出完整 JSON，不能有前言或結語
- keto_risk 只能是 low / medium / high
- confidence 只能是 high / medium / low
- calories、fat_g、protein_g、carb_g、fiber_g 必須是純數字
- carb_g 為淨碳水（已扣除膳食纖維）
- 營養標籤圖片請直接讀數值；食物相片請估算並在 notes 註明為估算`;

const MODEL_NAME = 'gemma-4-26b-a4b-it';
const MAX_RETRIES = 5;
const RETRYABLE_STATUS = [429, 500, 503, 504];

export async function analyzeImage(base64Data, mimeType = 'image/jpeg') {
  const apiKey = localStorage.getItem('keto_claude_api_key');
  if (!apiKey) throw new Error('NO_API_KEY');

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{
              role: 'user',
              parts: [
                { inline_data: { mime_type: mimeType, data: base64Data } },
                { text: '請分析這張圖片中的食物或營養標籤，回傳 JSON。' }
              ]
            }],
            generationConfig: {
              maxOutputTokens: 1024,
              temperature: 0.1
            }
          })
        }
      );

      const retryAfterSec = parseInt(res.headers?.get('Retry-After') || '0', 10);

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const msg = errBody.error?.message || `API 錯誤 ${res.status}`;
        if (RETRYABLE_STATUS.includes(res.status) && attempt < MAX_RETRIES) {
          await sleep(retryAfterSec > 0 ? retryAfterSec * 1000 : getBackoffMs(attempt));
          continue;
        }
        throw new Error(msg);
      }

      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const parsed = extractJSON(rawText);
      if (!parsed) throw new Error('PARSE_ERROR');

      return normalizeAnalysis(parsed);

    } catch (err) {
      lastError = err;
      const msg = String(err?.message || '');
      const isRetryable =
        msg.includes('high demand') ||
        msg.includes('overloaded') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('rate limit') ||
        msg.includes('quota') ||
        /\b(429|500|503|504)\b/.test(msg);

      if (isRetryable && attempt < MAX_RETRIES) {
        await sleep(getBackoffMs(attempt));
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('服務暫時無法使用，請稍後再試或手動輸入。');
}

function extractJSON(text) {
  if (!text) return null;

  const clean = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;

  const jsonText = clean.slice(start, end + 1);

  try {
    return JSON.parse(jsonText);
  } catch {
    try {
      return JSON.parse(jsonText.replace(/,\s*([}\]])/g, '$1'));
    } catch {
      return null;
    }
  }
}

function getBackoffMs(attempt) {
  return 1500 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 800);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeAnalysis(raw) {
  return {
    food_name: raw.food_name || '未知食物',
    estimated_serving: raw.estimated_serving || '1 份',
    calories: Number(raw.calories) || 0,
    fat_g: Number(raw.fat_g ?? raw.macros?.fat_g) || 0,
    protein_g: Number(raw.protein_g ?? raw.macros?.protein_g) || 0,
    carb_g: Number(raw.carb_g ?? raw.macros?.carb_g) || 0,
    fiber_g: Number(raw.fiber_g ?? raw.macros?.fiber_g) || 0,
    keto_risk: raw.keto_risk || 'medium',
    notes: raw.notes || '',
    confidence: raw.confidence || 'medium',
  };
}
