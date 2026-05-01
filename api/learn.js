/**
 * ARS Autonomous Boardroom Learning API - Stability Revert v1.1
 * 確実に動作していた時のシンプルなGemini呼び出しに戻す
 */

const restUrlKey = Object.keys(process.env).find(key => key.includes('_REST_API_URL'));
const restTokenKey = Object.keys(process.env).find(key => key.includes('_REST_API_TOKEN'));

if (restUrlKey && restTokenKey && !process.env.KV_REST_API_URL) {
    process.env.KV_REST_API_URL = process.env[restUrlKey];
    process.env.KV_REST_API_TOKEN = process.env[restTokenKey];
}
const { kv } = require('@vercel/kv');
const { GoogleGenerativeAI } = require('@google/generative-ai');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        // 最も標準的で無料枠が確実に効くモデル名に戻す
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
あなたは自律型AIエージェント「Boardroom」です。
日本のネットビジネスでリスクの高い分野を1つ発見し、監視用のNGワードを作成してください。
必ず以下のJSON形式でのみ答えてください。
{
  "boardroomLog": ["分析結果1", "提案2"],
  "rule": {
    "id": "英数字ID",
    "lawName": "法律名",
    "summary": "概要",
    "ngKeywords": ["ワード1", "ワード2"]
  }
}
`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text().trim().replace(/```json/g, '').replace(/```/g, '');
        const outputData = JSON.parse(responseText);
        const newRule = outputData.rule;

        let existingRules = await kv.get('ars_knowledge:rules') || [];
        if (typeof existingRules === 'string') existingRules = JSON.parse(existingRules);

        const index = existingRules.findIndex(r => r.id === newRule.id);
        if (index >= 0) existingRules[index] = newRule;
        else existingRules.push(newRule);

        await kv.set('ars_knowledge:rules', existingRules);

        return res.status(200).json({ success: true, learnedData: newRule });

    } catch (error) {
        console.error("Learning Error:", error);
        return res.status(500).json({ error: error.message });
    }
};
