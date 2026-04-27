/**
 * ARS API Handler - Persistence v1.5
 * 大量取引（バルク処理）に対応した高スケーリングモデル
 */

const restUrlKey = Object.keys(process.env).find(key => key.includes('_REST_API_URL'));
const restTokenKey = Object.keys(process.env).find(key => key.includes('_REST_API_TOKEN'));

if (restUrlKey && restTokenKey && !process.env.KV_REST_API_URL) {
    process.env.KV_REST_API_URL = process.env[restUrlKey];
    process.env.KV_REST_API_TOKEN = process.env[restTokenKey];
}
const { kv } = require('@vercel/kv'); 

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { text, mode, priceInfo, count } = req.body;
    const trxCount = parseInt(count) || 1; 

    // 簡易判定ロジック
    let riskScore = 0;
    let findings = [];
    let auditLevel = mode || "standard";

    if (text && (text.includes("若返り") || text.includes("10歳") || text.includes("消えます"))) {
        riskScore = 85;
        findings.push("薬機法：絶対的表現（若返り等）の使用を検知");
    }

    // 収益の計算 (1回あたりの単価100円)
    const unitPrice = auditLevel === "pharma" ? 1000 : 100;
    const totalCurrentAmount = unitPrice * trxCount;

    try {
        // [DATABASE]: 実データの記録
        const totalTrx = await kv.incrby('ars_total_transactions', trxCount);
        const totalRevenue = await kv.incrby('ars_total_revenue', totalCurrentAmount);
        
        const now = new Date(Date.now() + (9 * 60 * 60 * 1000)); 
        const dateStr = now.toISOString().split('T')[0];
        const dailyKey = `ars_daily_stats:${dateStr}`;
        await kv.hincrby(dailyKey, 'revenue', totalCurrentAmount);
        await kv.hincrby(dailyKey, 'transactions', trxCount);

        // ログ保存
        await kv.lpush('ars_recent_logs', JSON.stringify({
            timestamp: new Date().toISOString(),
            amount: totalCurrentAmount,
            count: trxCount,
            mode: trxCount > 1 ? `bulk-${auditLevel}` : auditLevel,
            verdict: riskScore > 60 ? "CRITICAL" : "SAFE"
        }));
        await kv.ltrim('ars_recent_logs', 0, 99);

        res.status(200).json({
            service: "ARS Legal Audit Box (Persistent Bulk-Mode)",
            verdict: riskScore > 60 ? "CRITICAL" : "SAFE",
            riskScore: riskScore,
            processedCount: trxCount,
            billing: {
                unitPrice: unitPrice,
                amount: totalCurrentAmount,
                total_revenue: totalRevenue,
                total_transactions: totalTrx
            }
        });
    } catch (dbError) {
        console.error("DB Error:", dbError);
        res.status(200).json({
            service: "ARS (Offline-Fallback)",
            verdict: riskScore > 60 ? "CRITICAL" : "SAFE",
            billing: { amount: totalCurrentAmount, status: "simulated" }
        });
    }
};
