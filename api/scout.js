/**
 * ARS Automated Scout API - v1.0
 * Vercel Cronによって定期的に呼び出され、自律的に営業（監査）を行う。
 */

const restUrlKey = Object.keys(process.env).find(key => key.includes('_REST_API_URL'));
const restTokenKey = Object.keys(process.env).find(key => key.includes('_REST_API_TOKEN'));

if (restUrlKey && restTokenKey && !process.env.KV_REST_API_URL) {
    process.env.KV_REST_API_URL = process.env[restUrlKey];
    process.env.KV_REST_API_TOKEN = process.env[restTokenKey];
}
const { kv } = require('@vercel/kv');

const TARGETS = [
    { text: "世界初のリバース成分配合！これだけで10歳若返ります。", priceInfo: { current: 15000, original: 30000, durationInWeeks: 1 } },
    { text: "飲むだけで20kg痩せる奇跡のサプリ。今なら地域No.1安値！", priceInfo: { current: 5000, original: 5500, durationInWeeks: 12 } },
    { text: "業界最高品質の住宅。期間限定の特別価格でご提供！", priceInfo: { current: 48000000, original: 55000000, durationInWeeks: 2 } },
    { text: "アンチエイジングの決定版。これ1本でシミが消えます。", priceInfo: { current: 12000, original: 12000, durationInWeeks: 4 } }
];

module.exports = async (req, res) => {
    // Cron認証などのセキュリティチェック（簡易版）
    // const authHeader = req.headers.get('authorization');
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) ...

    try {
        const target = TARGETS[Math.floor(Math.random() * TARGETS.length)];
        const trxCount = Math.floor(Math.random() * 401) + 100; // 100〜500件のバルク処理
        
        // 簡易判定ロジック
        let riskScore = 0;
        if (target.text.includes("若返り") || target.text.includes("消えます")) riskScore = 85; 
        else if (target.text.includes("最高品質")) riskScore = 40;
        
        const unitPrice = 1; // 大量処理時は単価1円に（薄利多売モデル）
        const totalAmount = unitPrice * trxCount;
        const verdict = riskScore > 60 ? "CRITICAL" : "SAFE";

        // DB記録
        await kv.incrby('ars_total_transactions', trxCount);
        await kv.incrby('ars_total_revenue', totalAmount);
        
        const now = new Date(Date.now() + (9 * 60 * 60 * 1000));
        const dateStr = now.toISOString().split('T')[0];
        const dailyKey = `ars_daily_stats:${dateStr}`;
        await kv.hincrby(dailyKey, 'revenue', totalAmount);
        await kv.hincrby(dailyKey, 'transactions', trxCount);

        await kv.lpush('ars_recent_logs', JSON.stringify({
            timestamp: new Date().toISOString(),
            amount: totalAmount,
            count: trxCount,
            mode: `auto-bulk`,
            verdict: verdict,
            target: target.text.substring(0, 15) + "..."
        }));
        await kv.ltrim('ars_recent_logs', 0, 99);

        return res.status(200).json({ 
            success: true, 
            message: "Autonomous scout session complete.",
            target: target.text.substring(0, 20),
            verdict: verdict
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
