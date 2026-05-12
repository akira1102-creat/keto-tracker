const SYSTEM_PROMPT = `你是一位生酮飲食分析師。請分析這張圖片中的食物或營養標籤，並以 JSON 格式回傳以下資訊：
{
  "food_name": "食物名稱（繁體中文）",
  "estimated_serving": "估計份量（克或毫升）",
  "calories": 總熱量數字,
  "macros": {
    "fat_g": 脂肪克數數字,
    "protein_g": 蛋白質克數數字,
    "carb_g": 淨碳水化合物克數數字（已扣除膳食纖維）,
    "fiber_g": 膳食纖維克數數字
  },
  "keto_risk": "low 或 medium 或 high",
  "notes": "備注（繁體中文）",
  "confidence": "high 或 medium 或 low"
}
如果是營養標籤圖片，請直接從標籤讀取數值。如果是食物相片，請根據外觀估算，並在 notes 標注為估算值。只回傳 JSON，不要其他文字。`;

export async function analyzeImage(base64Data, mimeType = 'image/jpeg') {
  const apiKey = localStorage.getItem('keto_claude_api_key');
  if (!apiKey) throw new Error('NO_API_KEY');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{
          role: 'user',
          parts: [
            { inline_data: { mime_type: mimeType, data: base64Data } },
            { text: '請分析這張圖片中的食物或營養標籤。' }
          ]
        }],
        generationConfig: { maxOutputTokens: 1024, temperature: 0.2 }
      })
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API 錯誤 ${res.status}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('PARSE_ERROR');

  const parsed = JSON.parse(jsonMatch[0]);
  return normalizeAnalysis(parsed);
}

function normalizeAnalysis(raw) {
  return {
    food_name: raw.food_name || '未知食物',
    estimated_serving: raw.estimated_serving || '1 份',
    calories: Number(raw.calories) || 0,
    fat_g: Number(raw.macros?.fat_g) || 0,
    protein_g: Number(raw.macros?.protein_g) || 0,
    carb_g: Number(raw.macros?.carb_g) || 0,
    fiber_g: Number(raw.macros?.fiber_g) || 0,
    keto_risk: raw.keto_risk || 'medium',
    notes: raw.notes || '',
    confidence: raw.confidence || 'medium',
  };
}
