/**
 * ARS API Handler - Persistence v1.4
 * Vercel KV (Redis) を活用した収益・取引履歴の永続化
 */

// 環境変数の詳細ブリッジ（Vercel Redis / Upstash / KV 各パターンに対応）
// さらにPrefix（KV_PROD等）がついていても自動で検知してエイリアスを作成します。
const restUrlKey = Object.keys(process.env).find(key => key.includes('_REST_API_URL'));
const restTokenKey = Object.keys(process.env).find(key => key.includes('_REST_API_TOKEN'));

if (restUrlKey && restTokenKey && !process.env.KV_REST_API_URL) {
    process.env.KV_REST_API_URL = process.env[restUrlKey];
    process.env.KV_REST_API_TOKEN = process.env[restTokenKey];
}
if (!process.env.KV_URL) {
    process.env.KV_URL = process.env.KV_REDIS_URL || process.env.REDIS_URL || process.env[restUrlKey];
}
const { kv } = require('@vercel/kv'); 

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { text, mode, priceInfo, evidence } = req.body;

    let riskScore = 0;
    let findings = [];
    let auditLevel = mode || "standard";

    // --- 判定ロジックは v1.3 を継承 ---
    // (中略: ステマ、二重価格、薬機法の判定コード)
    // --------------------------------

    // 収益の計算
    const amount = auditLevel === "pharma" ? 100 : 1;

    try {
        // [DATABASE]: 実データの記録
        // 1. 累計取引件数を＋1
        const totalTrx = await kv.incr('ars_total_transactions');
        // 2. 累計収益に加算
        const totalRevenue = await kv.incrby('ars_total_revenue', amount);
        
        // 3. 日次集計の追加 (今日の日付での集計)
        // 日本時間 (JST) で集計するために UTC+9 調整
        const now = new Date(Date.now() + (9 * 60 * 60 * 1000)); 
        const dateStr = now.toISOString().split('T')[0];
        const dailyKey = `ars_daily_stats:${dateStr}`;
        await kv.hincrby(dailyKey, 'revenue', amount);
        await kv.hincrby(dailyKey, 'transactions', 1);

        // 4. 直近ログを保存 (List)
        await kv.lpush('ars_recent_logs', JSON.stringify({
            timestamp: new Date().toISOString(),
            amount: amount,
            mode: auditLevel,
            verdict: riskScore > 60 ? "CRITICAL" : "SAFE"
        }));
        // 5. 直近ログは100件までに制限
        await kv.ltrim('ars_recent_logs', 0, 99);

        res.status(200).json({
            service: "ARS Legal Audit Box (Persistent)",
            verdict: riskScore > 60 ? "CRITICAL" : "SAFE",
            riskScore: riskScore,
            findings: findings,
            billing: {
                amount: amount,
                total_revenue: totalRevenue,
                total_transactions: totalTrx
            }
        });
    } catch (dbError) {
        // DB未設定時のフォールバック（動作継続を優先）
        console.error("DB Error (KV not integrated):", dbError);
        res.status(200).json({
            service: "ARS (Simulated-due-to-DB-offline)",
            verdict: riskScore > 60 ? "CRITICAL" : "SAFE",
            billing: { amount: amount, status: "simulated" }
        });
    }
};
