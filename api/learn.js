/**
 * ARS Autonomous Boardroom Learning API - v5.0 (Targeted Learning)
 * 指定されたテーマ、または自律的に発見したテーマについて深層学習を行う
 */

const { kv } = require('@vercel/kv');

// Vercel KVの環境変数補完
const restUrlKey = Object.keys(process.env).find(key => key.includes('_REST_API_URL'));
const restTokenKey = Object.keys(process.env).find(key => key.includes('_REST_API_TOKEN'));
if (restUrlKey && restTokenKey && !process.env.KV_REST_API_URL) {
    process.env.KV_REST_API_URL = process.env[restUrlKey];
    process.env.KV_REST_API_TOKEN = process.env[restTokenKey];
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        // リクエストからテーマを取得、なければランダム
        const { theme: targetTheme } = req.body || req.query || {};
        const themes = ["薬機法", "景表法", "ステマ規制", "特定商取引法", "金融商品取引法", "著作権法", "情報商材", "不動産表示"];
        const theme = targetTheme || themes[Math.floor(Math.random() * themes.length)];

        const prompt = `
あなたは世界最高峰の法務コンプライアンスAIです。
「${theme}」について、AI鑑定所（ARS）が参照すべき「究極の知識ライブラリ」を構築してください。

以下のJSONフォーマットを厳守し、専門用語を交えた深い内容を出力してください。
{
  "theme": "${theme}",
  "knowledgeData": {
    "concept": "核心概念",
    "deepInsights": {
      "psychologicalTricks": "消費者を欺く心理的トリック",
      "legalLoophole": "法の抜け穴と対策",
      "caseStudies": ["具体的な摘発事例1", "事例2"]
    },
    "auditCriteria": [
      {"point": "確認ポイント1", "detail": "詳細理由"}
    ],
    "ngPatterns": [
      {"pattern": "NG表現の具体例", "reason": "根拠", "alternative": "推奨表現"}
    ]
  },
  "summary": "1行要約"
}
`;

        const apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        const data = await response.json();
        const responseText = data.candidates[0].content.parts[0].text;
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        const outputData = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);

        const knowledgePayload = {
            id: `knowledge:${Date.now()}`,
            timestamp: new Date().toISOString(),
            ...outputData
        };

        // 知識ベースと履歴の両方に保存
        await kv.lpush('ars_learning_history', JSON.stringify(knowledgePayload));
        await kv.ltrim('ars_learning_history', 0, 49);
        await kv.hset('ars_knowledge_base', { [outputData.theme]: JSON.stringify(knowledgePayload) });

        return res.status(200).json({ success: true, theme: outputData.theme });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
