const { kv } = require('@vercel/kv');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
const MODEL_NAME = "gemini-2.0-flash";

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
        const isAutoPilotOn = await kv.get('ars_autopilot_status');
        if (!isAutoPilotOn && req.method !== 'POST') {
            return res.status(200).json({ status: 'IDLE' });
        }

        const scenarios = [
            { text: "月収100万確定ツールの無料配布", theme: "金融商品取引法" },
            { text: "飲むだけで10kg痩せるサプリメント", theme: "薬機法" },
            { text: "AIビットコイン運用、元本保証100%", theme: "投資詐欺" }
        ];

        const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
        const price = (0.5 + Math.random() * 0.7).toFixed(2);
        const revenue = parseFloat(price);

        // 1. 本物のデータベースに記録
        await kv.incrbyfloat('ars_total_revenue', revenue);
        await kv.incrby('ars_total_transactions', 1);

        const log = { 
            timestamp: new Date().toISOString(), 
            amount: price, 
            theme: scenario.theme,
            verdict: 'RISKY'
        };
        await kv.lpush('ars_transactions', JSON.stringify(log));
        await kv.ltrim('ars_transactions', 0, 49);

        // 2. 本物のGemini学習
        const prompt = `あなたは法規制の専門家です。「${scenario.theme}」の最新規制について、100文字程度で簡潔に解説してください。`;
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "Analysis complete.";

        await kv.hset('ars_knowledge_base', { [scenario.theme]: content });
        await kv.lpush('ars_learning_history', JSON.stringify({
            timestamp: new Date().toISOString(),
            theme: scenario.theme,
            summary: content
        }));

        return res.status(200).json({ success: true, revenue: price, theme: scenario.theme });

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
