/**
 * ARS Stats API - Dashboard Data Source
 * データベースから実統計データを取得してダッシュボードへ届ける
 */

// 環境変数の詳細ブリッジ
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

    try {
        const transactions = await kv.get('ars_total_transactions') || 0;
        const revenue = await kv.get('ars_total_revenue') || 0;
        const recentLogs = await kv.lrange('ars_recent_logs', 0, 9) || []; // 表示数を10件に増加

        // 直近7日間の日次統計を取得
        const dailyStats = [];
        const now = new Date(Date.now() + (9 * 60 * 60 * 1000));
        for (let i = 0; i < 7; i++) {
            const date = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000));
            const dateStr = date.toISOString().split('T')[0];
            const stats = await kv.hgetall(`ars_daily_stats:${dateStr}`);
            if (stats) {
                dailyStats.push({
                    date: dateStr,
                    revenue: parseInt(stats.revenue || 0),
                    transactions: parseInt(stats.transactions || 0)
                });
            }
        }

        return res.status(200).json({
            transactions,
            revenue,
            dailyStats,
            recentLogs: recentLogs.map(l => typeof l === 'string' ? JSON.parse(l) : l)
        });
    } catch (error) {
        return res.status(200).json({
            transactions: "Data Offline",
            revenue: "Data Offline",
            dailyStats: [],
            recentLogs: []
        });
    }
};
