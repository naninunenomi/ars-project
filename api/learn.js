/**
 * ARS Autonomous Boardroom Learning API - Direct Engine v3.0
 * SDKを使わず、Google Gemini v1 APIへ直接通信（Raw Fetch）を行う究極の安定版
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
        const prompt = `
あなたは、最新のビジネスコンプライアンスを監視する「自律型AIエージェント会議（Boardroom）」です。
日本国内のインターネット広告において、新たにトラブルや摘発リスクが急増している分野を1つ自律的に発見し、取り締まるための法律名とNGワード（ルール）を作成してください。

必ず以下のJSONフォーマットのみを出力してください（装飾不要）。
{
  "boardroomLog": ["分析結果1", "分析結果2"],
  "rule": {
    "id": "英数字ID",
    "lawName": "法律名やルールの名称",
    "summary": "概要",
    "ngKeywords": ["ワード1", "ワード2", "ワード3"]
  }
}
`;

        // --- SDKを使わず、正式版 v1 窓口へ直接リクエスト ---
        const apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { response_mime_type: "application/json" } // JSONモードを強制
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API Error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        const responseText = data.candidates[0].content.parts[0].text;
        
        let outputData;
        try {
            outputData = JSON.parse(responseText.trim().replace(/```json/g, '').replace(/```/g, ''));
        } catch (parseError) {
            console.error("Parse Error:", responseText);
            throw new Error("Gemini returned invalid JSON format.");
        }

        const newRule = outputData.rule;

        // KVから既存のルールを取得して追加
        let existingRules = await kv.get('ars_knowledge:rules') || [];
        if (typeof existingRules === 'string') existingRules = JSON.parse(existingRules);

        // 重複チェックして追加
        const index = existingRules.findIndex(r => r.id === newRule.id);
        if (index >= 0) existingRules[index] = newRule;
        else existingRules.push(newRule);

        await kv.set('ars_knowledge:rules', existingRules);

        return res.status(200).json({ 
            success: true, 
            message: `Autonomously learned: ${newRule.lawName}`,
            boardroomLog: outputData.boardroomLog,
            learnedData: newRule
        });

    } catch (error) {
        console.error("Learning Engine Error:", error);
        return res.status(500).json({ error: error.message });
    }
};
