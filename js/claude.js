const SYSTEM_PROMPT = `你是一位生酮飲食分析師。請分析這張圖片中的食物或營養標籤。
只回傳一個合法 JSON 物件，不要包含任何其他文字、說明或 markdown。

JSON 格式如下（所有數字欄位必須為數字，不要是文字）：
{
  "food_name": "食物名稱（繁體中文）",
  "estimated_serving": "份量說明",
  "calories": 0,
  "macros": {
    "fat_g": 0,
    "protein_g": 0,
    "carb_g": 0,
    "fiber_g": 0
  },
  "keto_risk": "low",
  "notes": "備注（繁體中文）",
  "confidence": "high"
}

規則：
- keto_risk 只能是 low / medium / high
- confidence 只能是 high / medium / low
- calories、fat_g、protein_g、carb_g、fiber_g 必須是純數字（不加單位）
- carb_g 為淨碳水（已扣除膳食纖維）
- 營養標籤圖片請直接讀數值；食物相片請估算並在 notes 說明為估算`;

const MODEL_NAME = 'gemini-3.1-flash-lite';
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
              temperature: 0.1,
              responseMimeType: 'application/json'
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

// 清洗並提取 JSON：支援 ```json``` 包裝、純 JSON、前後有雜字
 function extractJSON(text) {
  if (!text) return null;
  // 移除 markdown code block
  let clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  // 取出第一個 { ... }
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    // 嘗試修復：移除 trailing comma
    const fixed = match[0].replace(/,\s*([}\]])/g, '$1');
    try { return JSON.parse(fixed); } catch { return null; }
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
    fat_g: Number(raw.macros?.fat_g ?? raw.fat_g) || 0,
    protein_g: Number(raw.macros?.protein_g ?? raw.protein_g) || 0,
    carb_g: Number(raw.macros?.carb_g ?? raw.carb_g) || 0,
    fiber_g: Number(raw.macros?.fiber_g ?? raw.fiber_g) || 0,
    keto_risk: raw.keto_risk || 'medium',
    notes: raw.notes || '',
    confidence: raw.confidence || 'medium',
  };
}
