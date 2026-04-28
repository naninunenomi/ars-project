/**
 * ARS Learning API (Gemini Integration) - v1.0
 * 外部テキストをGeminiに解釈させ、法律名・概要・NGキーワードを抽出してKVに保存する
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
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'No text provided for learning' });

    if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is not configured.' });
    }

    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
以下のテキストは新しい法律やガイドラインの概要です。
これを読み解き、広告審査システム（ARS）が自動的にNGワードを検知できるように、以下のJSONフォーマットに変換して出力してください。
必ず純粋なJSON文字列のみを出力し、マークダウンの \`\`\`json などの装飾は一切含めないでください。

出力フォーマット:
{
  "id": "ユニークなアルファベットのID（例: premium_law, pharma_law）",
  "lawName": "法律名やルールの正式名称（例: 景品表示法、著作権法）",
  "summary": "このルールが何を禁止しているかの100文字程度の概要",
  "ngKeywords": ["NGワード1", "NGワード2", "NGパターン3"]
}

入力テキスト:
${text}
`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text().trim().replace(/```json/g, '').replace(/```/g, '');
        
        let newRule;
        try {
            newRule = JSON.parse(responseText);
        } catch (parseError) {
            console.error("Failed to parse Gemini output:", responseText);
            throw new Error("Gemini returned invalid JSON.");
        }

        // KVから既存のルールを取得して追加
        let existingRules = await kv.get('ars_knowledge:rules');
        if (!existingRules) {
            existingRules = [];
        } else if (!Array.isArray(existingRules)) {
            // KV get sometimes parses stringified JSON
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
            message: `Successfully learned: ${newRule.lawName}`,
            learnedData: newRule
        });

    } catch (error) {
        console.error("Learning API Error:", error);
        return res.status(500).json({ error: error.message });
    }
};
