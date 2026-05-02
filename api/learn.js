/**
 * ARS Autonomous Boardroom Learning API - Knowledge Engine v3.1
 * 知のライブラリ（Redis）へ重厚なデータを蓄積する、ダイレクトAPI版
 */

// Vercel KVの環境変数補完
const restUrlKey = Object.keys(process.env).find(key => key.includes('_REST_API_URL'));
const restTokenKey = Object.keys(process.env).find(key => key.includes('_REST_API_TOKEN'));
if (restUrlKey && restTokenKey && !process.env.KV_REST_API_URL) {
    process.env.KV_REST_API_URL = process.env[restUrlKey];
    process.env.KV_REST_API_TOKEN = process.env[restTokenKey];
}
// Vercel KVの環境変数補完
const restUrlKey = Object.keys(process.env).find(key => key.includes('_REST_API_URL'));
const restTokenKey = Object.keys(process.env).find(key => key.includes('_REST_API_TOKEN'));
if (restUrlKey && restTokenKey && !process.env.KV_REST_API_URL) {
    process.env.KV_REST_API_URL = process.env[restUrlKey];
    process.env.KV_REST_API_TOKEN = process.env[restTokenKey];
}
const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is missing.' });
    }

    try {
        // 学習テーマの決定（ランダム性を持たせる）
        const themes = ["薬機法", "景表法", "ステマ規制", "特定商取引法", "金融商品取引法", "著作権法"];
        const theme = themes[Math.floor(Math.random() * themes.length)];

        const prompt = `
あなたは世界最高峰のコンプライアンスAIです。
現在の日本における「${theme}」に関連する最新の違反事例や、AIが鑑定する際に参照すべき具体的な判断基準を、膨大な知識データとして生成してください。

以下のJSONフォーマットでのみ回答してください（Markdown装飾不可）。
{
  "theme": "${theme}",
  "knowledgeData": {
    "concept": "この法律の核心的な考え方",
    "recentTrends": "最近の摘発事例や傾向",
    "auditCriteria": ["基準1", "基準2", "基準3"],
    "ngPatterns": [
      {"pattern": "具体的なダメな表現", "reason": "なぜダメなのか"}
    ]
  },
  "summary": "この学習内容の短い要約"
}
`;

        const apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`;
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
                // response_mime_type を使わず、プロンプトで制御（エラー回避）
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
            // 文字列からJSON部分を抽出
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            outputData = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);
        } catch (parseError) {
            console.error("Parse Error:", responseText);
            throw new Error("Gemini returned invalid JSON format.");
        }

        // --- ライブラリ（Redis）への蓄積 ---
        const knowledgeId = `knowledge:${Date.now()}`;
        const knowledgePayload = {
            id: knowledgeId,
            timestamp: new Date().toISOString(),
            ...outputData
        };

        // 1. 最新の学習データとして保存
        await kv.set('ars_latest_knowledge', knowledgePayload);
        
        // 2. 学習履歴リストに追加
        await kv.lpush('ars_learning_history', JSON.stringify(knowledgePayload));
        await kv.ltrim('ars_learning_history', 0, 49); // 直近50件を保存

        // 3. 全知識インデックス（鑑定用）の更新
        await kv.hset('ars_knowledge_base', { [outputData.theme]: JSON.stringify(knowledgePayload) });

        // 診断用ステータスの更新
        await kv.set('ars_system_health', { status: 'HEALTHY', lastUpdate: new Date().toISOString() });

        return res.status(200).json({ 
            success: true, 
            theme: outputData.theme,
            summary: outputData.summary
        });

    } catch (error) {
        console.error("Learning Engine Error:", error);
        await kv.set('ars_system_health', { status: 'ERROR', message: error.message, lastUpdate: new Date().toISOString() });
        return res.status(500).json({ error: error.message });
    }
};
