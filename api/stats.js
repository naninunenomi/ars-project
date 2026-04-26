/**
 * ARS Stats API - Dashboard Data Source
 * データベースから実統計データを取得してダッシュボードへ届ける
 */

if (!process.env.KV_URL && process.env.KV_REDIS_URL) {
    process.env.KV_URL = process.env.KV_REDIS_URL;
    process.env.KV_REST_API_URL = process.env.KV_REDIS_REST_API_URL;
    process.env.KV_REST_API_TOKEN = process.env.KV_REDIS_REST_API_TOKEN;
}
const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
        const transactions = await kv.get('ars_total_transactions') || 0;
        const revenue = await kv.get('ars_total_revenue') || 0;
        const recentLogs = await kv.lrange('ars_recent_logs', 0, 5) || [];

        return res.status(200).json({
            transactions,
            revenue,
            recentLogs: recentLogs.map(l => typeof l === 'string' ? JSON.parse(l) : l)
        });
    } catch (error) {
        return res.status(200).json({
            transactions: "Data Offline",
            revenue: "Data Offline",
            recentLogs: []
        });
    }
};
