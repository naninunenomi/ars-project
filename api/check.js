/**
 * ARS AI Appraisal Window - v10.1 (Robust Edition)
 */

const crypto = require('crypto');
const DISCLAIMER = "※本結果はAIによる鑑定であり、100%の正確性を保証するものではありません。最終的な判断は専門家にご確認ください。";

// Redis Helper (Direct Fetch)
const redis = async (command, ...args) => {
    // 環境変数の自動マッピング (KV_... がなくても _REST_API_URL を探す)
    let url = process.env.KV_REST_API_URL;
    let token = process.env.KV_REST_API_TOKEN;

    if (!url || !token) {
        const urlKey = Object.keys(process.env).find(k => k.includes('_REST_API_URL'));
        const tokenKey = Object.keys(process.env).find(k => k.includes('_REST_API_TOKEN'));
        if (urlKey && tokenKey) {
            url = process.env[urlKey];
            token = process.env[tokenKey];
        }
    }

    if (!url || !token) throw new Error("Missing KV environment variables");
    
    const res = await fetch(`${url}/${command}/${args.join('/')}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    return data.result;
};

module.exports = async (req, res) => {
    const startTime = Date.now();
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { text, theme = "一般広告" } = req.body || {};
    if (!text) return res.status(400).json({ error: 'Text is required' });

    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_SOON')), 8500));

    try {
        const hash = crypto.createHash('md5').update(text).digest('hex');
        const cacheKey = `ars_cache:${hash}`;
        
        const cachedResponse = await redis('get', cacheKey);
        if (cachedResponse) {
            const price = (0.5 + Math.random() * 0.2).toFixed(2);
            await recordTransaction(price, 'CACHE_HIT');
            return res.json({ ...JSON.parse(cachedResponse), price: `${price} ARS`, source: 'CACHE', disclaimer: DISCLAIMER });
        }

        const appraisalTask = async () => {
            const knowledge = await redis('hget', 'ars_knowledge_base', theme);
            let source = 'GEMINI_APPRAISAL';
            let basePrice = 1.1;

            if (knowledge) {
                basePrice = 0.9;
                source = 'KNOWLEDGE_LIBRARY';
            } else {
                await redis('rpush', 'ars_learning_queue', theme);
            }

            const prompt = `以下のテキストを「${theme}」の観点で精密に鑑定してください。\n【テキスト】: "${text}"\n【参照知識】: ${knowledge || "なし。"}\nJSON形式のみで回答: { "verdict": "SAFE/RISKY/DANGER", "reason": "理由" }`;

            const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });

            const data = await geminiRes.json();
            if (!data.candidates) throw new Error('Gemini API Error');
            const responseText = data.candidates[0].content.parts[0].text;
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            const finalVerdict = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);

            const finalPrice = (basePrice + (Math.random() * 0.1)).toFixed(2);
            await recordTransaction(finalPrice, source);
            
            // Set cache for 24h
            await fetch(`${process.env.KV_REST_API_URL}/set/${cacheKey}/${encodeURIComponent(JSON.stringify(finalVerdict))}/EX/86400`, {
                headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
            });

            return { ...finalVerdict, price: `${finalPrice} ARS`, source };
        };

        const result = await Promise.race([appraisalTask(), timeoutPromise]);
        return res.json({ ...result, disclaimer: DISCLAIMER });

    } catch (error) {
        if (error.message === 'TIMEOUT_SOON') {
            return res.json({ status: 'BUSY', message: "解析に時間を要しています。10秒後に再試行してください。", disclaimer: DISCLAIMER });
        }
        return res.status(500).json({ error: error.message, disclaimer: DISCLAIMER });
    }
};

async function recordTransaction(price, source) {
    const today = new Date().toISOString().split('T')[0];
    const revenue = parseFloat(price);
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    
    const log = JSON.stringify({ timestamp: new Date().toISOString(), amount: price, source });
    
    // パイプラインが使えないため個別実行（安定重視）
    await fetch(`${url}/hincrbyfloat/ars_daily_stats:${today}/revenue/${revenue}`, { headers: { Authorization: `Bearer ${token}` } });
    await fetch(`${url}/hincrby/ars_daily_stats:${today}/transactions/1`, { headers: { Authorization: `Bearer ${token}` } });
    await fetch(`${url}/incrbyfloat/ars_total_revenue/${revenue}`, { headers: { Authorization: `Bearer ${token}` } });
    await fetch(`${url}/lpush/ars_transactions/${encodeURIComponent(log)}`, { headers: { Authorization: `Bearer ${token}` } });
    await fetch(`${url}/ltrim/ars_transactions/0/49`, { headers: { Authorization: `Bearer ${token}` } });
}
