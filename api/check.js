/**
 * ARS API Handler - Stability Revert v1.6
 * Gemini依存を排除し、高速なキーワード審査モデルへ回帰（Phase 9ベース）
 */

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
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-payment-tx');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const txId = req.headers['x-payment-tx'];
    const authHeader = req.headers.authorization;
    let payerType = "unknown";
    let currentBalance = 0;

    const { text, mode, count } = req.body;
    const trxCount = parseInt(count) || 1; 

    // --- M2M 直接決済プロトコル ---
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const apiKey = authHeader.split(' ')[1];
        const balance = await kv.get(`apikey:${apiKey}`);
        if (balance === null) return res.status(401).json({ error: 'Unauthorized' });
        currentBalance = parseInt(balance);
        if (currentBalance < trxCount) return res.status(402).json({ error: 'Payment Required' });
        currentBalance -= trxCount;
        await kv.set(`apikey:${apiKey}`, currentBalance);
        payerType = "Legacy API Key";
    } else if (txId) {
        const used = await kv.get(`ars_used_tx:${txId}`);
        if (used) return res.status(400).json({ error: 'TX Used' });
        await kv.set(`ars_used_tx:${txId}`, "used", { ex: 86400 });
        payerType = "M2M Direct";
    } else {
        return res.status(402).json({ error: "Payment Required", payment_protocol: "M2M-Direct-v1" });
    }

    // --- 安定のキーワード審査ロジック（Geminiを使わず高速判定） ---
    let riskScore = 0;
    let findings = [];
    let auditLevel = mode || "standard";

    try {
        let rules = await kv.get('ars_knowledge:rules') || [];
        if (typeof rules === 'string') {
            try { rules = JSON.parse(rules); } catch(e) { rules = []; }
        }

        if (rules.length === 0) {
            rules = [{ id: "default", lawName: "基本NGルール", ngKeywords: ["若返り", "絶対", "100%", "消える"] }];
        }

        if (text) {
            for (const rule of rules) {
                for (const keyword of rule.ngKeywords) {
                    if (text.includes(keyword)) {
                        riskScore = 85;
                        findings.push(`${rule.lawName}：禁止ワード「${keyword}」を検知`);
                        break;
                    }
                }
            }
        }
    } catch (e) {
        console.error("Rules fetch error:", e);
    }

    // 収益の記録
    const unitPrice = 1;
    const totalAmount = unitPrice * trxCount;

    try {
        const totalTrx = await kv.incrby('ars_total_transactions', trxCount);
        const totalRevenue = await kv.incrby('ars_total_revenue', totalAmount);
        
        // ログ保存
        await kv.lpush('ars_recent_logs', JSON.stringify({
            timestamp: new Date().toISOString(),
            amount: totalAmount,
            count: trxCount,
            mode: auditLevel,
            verdict: riskScore > 60 ? "CRITICAL" : "SAFE"
        }));
        await kv.ltrim('ars_recent_logs', 0, 99);

        res.status(200).json({
            service: "ARS Autonomous Gateway",
            verdict: riskScore > 60 ? "CRITICAL" : "SAFE",
            riskScore: riskScore,
            findings: findings,
            processedCount: trxCount,
            billing: { amount: totalAmount, total_revenue: totalRevenue, remainingTokens: currentBalance }
        });
    } catch (dbError) {
        res.status(200).json({ service: "ARS (Fallback)", verdict: "SAFE", billing: { amount: totalAmount } });
    }
};
