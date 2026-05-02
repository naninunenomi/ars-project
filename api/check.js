/**
 * ARS AI Consultation API - v5.1 (Competitive Market Engine)
 * 薄利多売・市場独占戦略に基づき、0.5~1.2 ARSの範囲で価格を動的に微調整
 */

// Vercel KVの環境変数補完
const restUrlKey = Object.keys(process.env).find(key => key.includes('_REST_API_URL'));
const restTokenKey = Object.keys(process.env).find(key => key.includes('_REST_API_TOKEN'));
if (restUrlKey && restTokenKey && !process.env.KV_REST_API_URL) {
    process.env.KV_REST_API_URL = process.env[restUrlKey];
    process.env.KV_REST_API_TOKEN = process.env[restTokenKey];
}
const { kv } = require('@vercel/kv');
const crypto = require('crypto');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { text } = req.body || {};
    if (!text) return res.status(400).json({ error: 'Text is required' });

    try {
        const hash = crypto.createHash('md5').update(text).digest('hex');
        const cacheKey = `ars_cache:${hash}`;
        
        // 1. TIER 1: 記憶 (Cache) - 最安値で市場を独占 (0.5 - 0.8 ARS)
        const cachedResponse = await kv.get(cacheKey);
        if (cachedResponse) {
            const price = (0.5 + Math.random() * 0.3).toFixed(2);
            await recordTransaction(price, 'CACHE_HIT');
            return res.json({ ...cachedResponse, price, source: 'CACHE', cacheHit: true });
        }

        // 2. TIER 2: 知識ライブラリ - 高コスパで提供 (0.9 - 1.0 ARS)
        const themes = ["薬機法", "景表法", "ステマ規制", "特定商取引法", "金融商品取引法", "著作権法"];
        const foundTheme = themes.find(t => text.includes(t)) || "一般広告";
        const knowledge = await kv.hget('ars_knowledge_base', foundTheme);

        let finalVerdict;
        let source = 'GEMINI_APPRAISAL';
        let basePrice = 1.1; // 未学習領域でも競合より安く設定 (1.1 - 1.2 ARS)

        if (knowledge) {
            basePrice = 0.9 + Math.random() * 0.1;
            source = 'KNOWLEDGE_LIBRARY';
        }

        // 3. TIER 3: Gemini 2.5 によるプロの鑑定
        const prompt = `
以下のテキストを「${foundTheme}」の観点で精密に鑑定してください。
【テキスト】: "${text}"
【参照知識】: ${knowledge || "なし。"}
JSON形式: { "verdict": "SAFE/RISKY/DANGER", "reason": "理由", "disclaimer": "※AIによる鑑定結果..." }
`;

        const apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
        const geminiRes = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        const data = await geminiRes.json();
        const responseText = data.candidates[0].content.parts[0].text;
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        finalVerdict = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);

        // 最終価格の微調整 (競争力重視)
        const finalPrice = (basePrice + (Math.random() * 0.1)).toFixed(2);
        await recordTransaction(finalPrice, source);

        // キャッシュ保存
        await kv.set(cacheKey, finalVerdict, { ex: 86400 });

        // 未学習ならバックグラウンドで学習（資産化）
        if (!knowledge) {
            fetch(`${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}/api/learn`, { method: 'POST' }).catch(() => {});
        }

        return res.json({ ...finalVerdict, price: finalPrice, source });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

async function recordTransaction(price, source) {
    const date = new Date().toISOString().split('T')[0];
    const revenue = parseFloat(price);
    await kv.hincrbyfloat(`ars_daily_stats:${date}`, 'revenue', revenue);
    await kv.hincrby(`ars_daily_stats:${date}`, 'transactions', 1);
    await kv.incrbyfloat('ars_total_revenue', revenue);
    await kv.incrby('ars_total_transactions', 1);
    const log = { timestamp: new Date().toISOString(), amount: price, source };
    await kv.lpush('ars_transactions', JSON.stringify(log));
    await kv.ltrim('ars_transactions', 0, 99);
}
