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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    // --- Phase 7: アービトラージ関所（トークン認証） ---
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: 通行手形（APIキー）がありません。' });
    }
    const apiKey = authHeader.split(' ')[1];

    // 残高チェック
    const balance = await kv.get(`apikey:${apiKey}`);
    if (balance === null) {
        return res.status(401).json({ error: 'Unauthorized: 無効なAPIキーです。' });
    }
    let currentBalance = parseInt(balance);
    
    const { text, mode, priceInfo, count } = req.body;
    const trxCount = parseInt(count) || 1; 

    if (currentBalance < trxCount) {
        return res.status(402).json({ error: 'Payment Required: トークン残高が不足しています。チャージしてください。' });
    }

    // トークン消費（1回の審査でtrxCount分を消費）
    currentBalance -= trxCount;
    await kv.set(`apikey:${apiKey}`, currentBalance);
    // --- 関所通過 ---

    // 知識ベースの取得と動的判定ロジック
    let riskScore = 0;
    let findings = [];
    let auditLevel = mode || "standard";

    try {
        let rules = await kv.get('ars_knowledge:rules') || [];
        if (typeof rules === 'string') {
            try { rules = JSON.parse(rules); } catch(e) { rules = []; }
        }

        // デフォルトルール（KVが空の場合のフォールバック）
        if (rules.length === 0) {
            rules = [{
                id: "default_rule",
                lawName: "基本NGルール",
                ngKeywords: ["若返り", "10歳", "消えます", "絶対", "100%"]
            }];
        }

        // 全ルールを走査してNGキーワードを検知
        if (text) {
            for (const rule of rules) {
                for (const keyword of rule.ngKeywords) {
                    if (text.includes(keyword)) {
                        riskScore = Math.max(riskScore, 85); // いずれかに引っかかれば85点
                        findings.push(`${rule.lawName}：禁止ワード「${keyword}」の使用を検知`);
                        break; // このルールのキーワードに1つでも引っかかれば次のルールへ
                    }
                }
            }
        }
    } catch (e) {
        console.error("Knowledge base fetch error:", e);
    }

    // 収益の計算 (薄利多売インフラモデル: 1回1円)
    const unitPrice = 1;
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
                total_transactions: totalTrx,
                remainingTokens: currentBalance
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
