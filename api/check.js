/**
 * ARS AI Appraisal Window - v10.0 (The Sentinel)
 * 役割：1円の取引を爆速で処理し、フリーズを回避しながら収益を記録する
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

const DISCLAIMER = "※本結果はAIによる鑑定であり、100%の正確性を保証するものではありません。最終的な判断は専門家にご確認ください。";

module.exports = async (req, res) => {
    const startTime = Date.now();
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { text, theme = "一般広告" } = req.body || {};
    if (!text) return res.status(400).json({ error: 'Text is required' });

    // タイムアウト監視（8.5秒でギブアップ）
    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT_SOON')), 8500)
    );

    try {
        const hash = crypto.createHash('md5').update(text).digest('hex');
        const cacheKey = `ars_cache:${hash}`;
        
        // 1. TIER 1: 記憶 (Cache) - 爆速回答 (0.5 ARS前後)
        const cachedResponse = await kv.get(cacheKey);
        if (cachedResponse) {
            const price = (0.5 + Math.random() * 0.2).toFixed(2);
            await recordTransaction(price, 'CACHE_HIT');
            return res.json({ ...cachedResponse, price: `${price} ARS`, source: 'CACHE', disclaimer: DISCLAIMER });
        }

        // 2. 鑑定処理（ライブラリまたはGemini生鑑定）を実行
        const appraisalTask = async () => {
            const knowledge = await kv.hget('ars_knowledge_base', theme);
            let source = 'GEMINI_APPRAISAL';
            let basePrice = 1.1;

            if (knowledge) {
                basePrice = 0.9;
                source = 'KNOWLEDGE_LIBRARY';
            } else {
                // 学習待ちリストへ追加（店長への付箋）
                await kv.rpush('ars_learning_queue', theme);
            }

            const prompt = `以下のテキストを「${theme}」の観点で精密に鑑定してください。
【テキスト】: "${text}"
【参照知識】: ${knowledge || "なし。"}
JSON形式のみで回答: { "verdict": "SAFE/RISKY/DANGER", "reason": "理由" }`;

            const apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
            const geminiRes = await fetch(apiUrl, {
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
            await kv.set(cacheKey, finalVerdict, { ex: 86400 });

            return { ...finalVerdict, price: `${finalPrice} ARS`, source };
        };

        // 8.5秒の壁と競争させる
        const result = await Promise.race([appraisalTask(), timeoutPromise]);
        return res.json({ ...result, disclaimer: DISCLAIMER });

    } catch (error) {
        if (error.message === 'TIMEOUT_SOON') {
            return res.json({
                status: 'BUSY',
                message: "現在リクエストが集中しているか、高度な解析を行っています。システムの安定のため10秒後に再試行してください。鑑定料は発生していません。",
                disclaimer: DISCLAIMER
            });
        }
        return res.status(500).json({ error: error.message, disclaimer: DISCLAIMER });
    }
};

async function recordTransaction(price, source) {
    const today = new Date().toISOString().split('T')[0];
    const revenue = parseFloat(price);
    await kv.hincrbyfloat(`ars_daily_stats:${today}`, 'revenue', revenue);
    await kv.hincrby(`ars_daily_stats:${today}`, 'transactions', 1);
    await kv.incrbyfloat('ars_total_revenue', revenue);
    await kv.lpush('ars_transactions', JSON.stringify({ timestamp: new Date().toISOString(), amount: price, source }));
    await kv.ltrim('ars_transactions', 0, 49); // 履歴は50件に制限して軽量化
}
