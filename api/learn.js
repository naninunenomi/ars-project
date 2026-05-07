/**
 * ARS Learning API - v8.0 (Final Verified)
 * Hardcoded bypass for Vercel failure. Gemini 2.0 Real AI integration.
 */

const MODEL_NAME = "gemini-2.0-flash";

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const UPSTASH_URL = "https://pretty-llama-117521.upstash.io";
    const UPSTASH_TOKEN = "gQAAAAAAAcsRAAIgcDIzMTUxOGQzNmY5Yzg0ZjE1YTA0OWE4YWRmNzc2N2E3NQ";
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;

    const redis = async (command, ...args) => {
        const url = `${UPSTASH_URL}/${command}${args.length ? '/' + args.join('/') : ''}`;
        const response = await fetch(url, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } });
        return await response.json();
    };

    try {
        const themes = ["薬機法", "景表法", "ステマ規制", "特定商取引法", "金融商品取引法"];
        const theme = themes[Math.floor(Math.random() * themes.length)];

        if (GEMINI_API_KEY) {
            const prompt = `あなたは法務の専門家です。「${theme}」について、1行で要約と対策を簡潔に解説してください。`;
            const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const geminiData = await geminiRes.json();
            const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Study complete.";

            const payload = { timestamp: new Date().toISOString(), theme, summary: content };
            
            // Push to history
            await fetch(`${UPSTASH_URL}/lpush/ars_learning_history/${encodeURIComponent(JSON.stringify(payload))}`, {
                headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
            });
            // Set to knowledge base
            await fetch(`${UPSTASH_URL}/hset/ars_knowledge_base/${theme}/${encodeURIComponent(JSON.stringify(payload))}`, {
                headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
            });
        }

        return res.status(200).json({ success: true, theme });

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
