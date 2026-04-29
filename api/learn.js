/**
 * ARS Autonomous Boardroom Learning API - v2.0
 * AI同士が議論して需要を発見し、法律を学習する完全自律型エンジン
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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

    if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is not configured.' });
    }

    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        const prompt = `
あなたは、最新のビジネスコンプライアンスを監視する「自律型AIエージェント会議（Boardroom）」です。
現在、日本国内のインターネット広告やデジタルビジネスにおいて、新たにトラブルや摘発リスクが急増している分野を1つランダムに自律的に推論・発見してください。（例：仮想通貨詐欺、悪質なサブスク定期購入、情報商材、ディープフェイク広告、著作権侵害など、毎回異なるランダムな分野を選んでください）。

そして、その分野を取り締まるための「日本の関連法律やガイドライン」を1つ特定し、システムに学習させるためのNGワード（ルール）を作成してください。

必ず以下のJSONフォーマットのみを出力してください（マークダウンの \`\`\`json などの装飾は一切含めないでください）。

出力フォーマット:
{
  "boardroomLog": [
    "市場分析AI: [なぜこの分野に需要（リスク）があるのかの分析]",
    "法務AI: [どの法律を適用し、どういった表現を監視すべきかの提案]"
  ],
  "rule": {
    "id": "ユニークなアルファベットのID（例: crypto_law, subsc_law）",
    "lawName": "適用する法律名やルールの正式名称",
    "summary": "このルールが何を監視・禁止しているかの概要",
    "ngKeywords": ["NGワード1", "NGワード2", "NGパターン3"]
  }
}
`;

        let result;
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            result = await model.generateContent(prompt);
        } catch (apiError) {
            console.warn("Primary model failed, falling back to 2.0-flash:", apiError.message);
            const fallbackModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
            result = await fallbackModel.generateContent(prompt);
        }

        const responseText = result.response.text().trim().replace(/```json/g, '').replace(/```/g, '');
        
        let outputData;
        try {
            outputData = JSON.parse(responseText);
        } catch (parseError) {
            console.error("Failed to parse Gemini output:", responseText);
            throw new Error("Gemini returned invalid JSON.");
        }

        const newRule = outputData.rule;

        // KVから既存のルールを取得して追加
        let existingRules = await kv.get('ars_knowledge:rules');
        if (!existingRules) {
            existingRules = [];
        } else if (!Array.isArray(existingRules)) {
            if (typeof existingRules === 'string') {
                try { existingRules = JSON.parse(existingRules); } catch(e) { existingRules = []; }
            } else {
                existingRules = [];
            }
        }

        // 同じIDがあれば上書き、なければ追加
        const index = existingRules.findIndex(r => r.id === newRule.id);
        if (index >= 0) {
            existingRules[index] = newRule;
        } else {
            existingRules.push(newRule);
        }

        await kv.set('ars_knowledge:rules', existingRules);

        return res.status(200).json({ 
            success: true, 
            message: `Autonomously learned: ${newRule.lawName}`,
            boardroomLog: outputData.boardroomLog,
            learnedData: newRule
        });

    } catch (error) {
        console.error("Autonomous Learning API Error:", error);
        return res.status(500).json({ error: error.message });
    }
};
