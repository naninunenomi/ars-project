/**
 * ARS Autonomous Boardroom Learning API - Deep Knowledge Engine v4.0
 * Gemini 2.5 世代の知能をフル活用し、専門的な鑑定知識をライブラリ化する
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
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is missing.' });
    }

    try {
        const themes = ["薬機法", "景表法", "ステマ規制", "特定商取引法", "金融商品取引法", "著作権法", "情報商材規制", "不動産表示規約"];
        const theme = themes[Math.floor(Math.random() * themes.length)];

        const prompt = `
あなたは世界最高峰の法務コンプライアンスAI「Boardroom Expert」です。
現在、日本で特にトラブルが急増している「${theme}」について、AI鑑定所（ARS）が参照すべき「究極の知識ライブラリ」を構築してください。

以下のJSONフォーマットを厳守し、専門用語を交えた深い内容を出力してください。
{
  "theme": "${theme}",
  "knowledgeData": {
    "concept": "この法律の核心、およびAIが最も注視すべき精神",
    "deepInsights": {
      "psychologicalTricks": "消費者を欺くために使われる最新の心理的トリック",
      "legalLoophole": "業者が悪用しがちな法の抜け穴とその対策",
      "caseStudies": ["最近の具体的な摘発事例1", "最近の具体的な摘発事例2"]
    },
    "auditCriteria": [
      {"point": "確認ポイント1", "detail": "なぜそこを見るべきかの詳細理由"},
      {"point": "確認ポイント2", "detail": "詳細理由"}
    ],
    "ngPatterns": [
      {"pattern": "NG表現の具体例", "reason": "法的根拠に基づいたNG理由", "alternative": "推奨されるクリーンな表現"}
    ]
  },
  "summary": "この学習内容の1行要約"
}
`;

        const apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API Error: ${errorText}`);
        }

        const data = await response.json();
        const responseText = data.candidates[0].content.parts[0].text;
        
        let outputData;
        try {
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            outputData = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
        } catch (parseError) {
            console.error("Parse Error:", responseText);
            throw new Error("Gemini returned invalid JSON format.");
        }

        const knowledgePayload = {
            id: `knowledge:${Date.now()}`,
            timestamp: new Date().toISOString(),
            ...outputData
        };

        await kv.lpush('ars_learning_history', JSON.stringify(knowledgePayload));
        await kv.ltrim('ars_learning_history', 0, 49);
        await kv.hset('ars_knowledge_base', { [outputData.theme]: JSON.stringify(knowledgePayload) });

        // システムステータスを正常に
        await kv.set('ars_system_health', { status: 'HEALTHY', lastUpdate: new Date().toISOString() });

        return res.status(200).json({ 
            success: true, 
            theme: outputData.theme,
            summary: outputData.summary
        });

    } catch (error) {
        console.error("Learning Engine Error:", error);
        return res.status(500).json({ error: error.message });
    }
};
