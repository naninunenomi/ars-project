/**
 * ARS AI Consultation API - v4.0
 * 記憶(キャッシュ)・知識ライブラリ・Gemini鑑定を統合した「AI鑑定所」エンジン
 */

const { kv } = require('@vercel/kv');
const crypto = require('crypto');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-payment-tx');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { text, mode, count } = req.body;
    const trxCount = parseInt(count) || 1; 
    const txId = req.headers['x-payment-tx'] || `sim-${Date.now()}`;

    try {
        // --- STEP 1: 記憶（キャッシュ）の照合 ---
        const textHash = crypto.createHash('md5').update(text || '').digest('hex');
        const cacheKey = `ars_cache:${textHash}`;
        const cachedResponse = await kv.get(cacheKey);

        if (cachedResponse) {
            return res.status(200).json({
                ...cachedResponse,
                cacheHit: true,
                note: "※記憶（キャッシュ）から1ミリ秒で即答しました。"
            });
        }

        // --- STEP 2: 知識ライブラリの参照 ---
        // 全ての学習済み知識をハッシュマップから取得
        const knowledgeBase = await kv.hgetall('ars_knowledge_base') || {};
        const knowledgeContext = JSON.stringify(knowledgeBase);

        // --- STEP 3: Geminiによる専門鑑定（内製） ---
        const prompt = `
あなたは世界最高峰の法務・コンプライアンスAI鑑定士です。
以下の「知のライブラリ（学習済みデータ）」を背景知識として、対象の文章を厳密に鑑定してください。

【知のライブラリ】
${knowledgeContext}

【鑑定対象の文章】
${text}

必ず以下のJSON形式で回答してください。
{
  "verdict": "SAFE または CRITICAL",
  "riskScore": 0-100の数値,
  "analysis": "専門的な鑑定理由の詳細",
  "advice": "修正への具体的なアドバイス"
}
`;

        const apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
        const geminiRes = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (!geminiRes.ok) throw new Error("Gemini Appraisal Failed");

        const geminiData = await geminiRes.json();
        const responseText = geminiData.candidates[0].content.parts[0].text;
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        const appraisalResult = JSON.parse(jsonMatch ? jsonMatch[0] : responseText);

        // 免責事項と基本情報の付与
        const finalResponse = {
            service: "ARS AI Consultation Office",
            ...appraisalResult,
            disclaimer: "※本結果はAIによる鑑定結果であり、その正確性や法的効力を保証するものではありません。",
            timestamp: new Date().toISOString()
        };

        // --- STEP 4: 記憶（キャッシュ）への保存 ---
        await kv.set(cacheKey, finalResponse, { ex: 604800 }); // 1週間キャッシュ

        // --- STEP 5: 収益と統計の記録（ダッシュボード用） ---
        const unitPrice = 1;
        const totalAmount = unitPrice * trxCount;
        const now = new Date(Date.now() + (9 * 60 * 60 * 1000));
        const dateStr = now.toISOString().split('T')[0];

        await kv.incrby('ars_total_revenue', totalAmount);
        await kv.incrby('ars_total_transactions', trxCount);
        await kv.hincrby(`ars_daily_stats:${dateStr}`, 'revenue', totalAmount);
        await kv.hincrby(`ars_daily_stats:${dateStr}`, 'transactions', trxCount);
        
        // 取引ログ（ダッシュボード用）
        await kv.lpush('ars_transaction_logs', JSON.stringify({
            timestamp: finalResponse.timestamp,
            text: text ? text.substring(0, 30) + "..." : "",
            verdict: finalResponse.verdict,
            amount: totalAmount
        }));
        await kv.ltrim('ars_transaction_logs', 0, 99);

        return res.status(200).json(finalResponse);

    } catch (error) {
        console.error("Appraisal Error:", error);
        return res.status(500).json({ error: error.message });
    }
};
