/**
 * ARS Diagnostic & Stats API
 * ダッシュボード表示用の全データを集約して返す
 */

// Vercel KVの環境変数補完
const restUrlKey = Object.keys(process.env).find(key => key.includes('_REST_API_URL'));
const restTokenKey = Object.keys(process.env).find(key => key.includes('_REST_API_TOKEN'));
if (restUrlKey && restTokenKey && !process.env.KV_REST_API_URL) {
    process.env.KV_REST_API_URL = process.env[restUrlKey];
    process.env.KV_REST_API_TOKEN = process.env[restTokenKey];
}
const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    try {
        // 1. 基本統計
        const totalRevenue = await kv.get('ars_total_revenue') || 0;
        const totalTransactions = await kv.get('ars_total_transactions') || 0;
        const health = await kv.get('ars_system_health') || { status: 'UNKNOWN' };

        // 2. 直近7日の推移
        const history = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date(Date.now() + (9 * 60 * 60 * 1000));
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            const stats = await kv.hgetall(`ars_daily_stats:${dateStr}`);
            if (stats) {
                history.push({ date: dateStr, ...stats });
            }
        }

        // 3. 学習履歴 (直近10件)
        const learningLogs = await kv.lrange('ars_learning_history', 0, 9) || [];
        const parsedLearningLogs = learningLogs.map(log => typeof log === 'string' ? JSON.parse(log) : log);

        // 4. 取引ログ (直近10件)
        const trxLogs = await kv.lrange('ars_transaction_logs', 0, 9) || [];
        const parsedTrxLogs = trxLogs.map(log => typeof log === 'string' ? JSON.parse(log) : log);

        // 5. 学習データの概要（現在持っている知識のテーマ一覧）
        const knowledgeBase = await kv.hgetall('ars_knowledge_base') || {};
        const knowledgeThemes = Object.keys(knowledgeBase);

        res.status(200).json({
            summary: {
                totalRevenue: parseInt(totalRevenue),
                totalTransactions: parseInt(totalTransactions),
                jpyProjection: parseInt(totalRevenue) * 1, // 1トークン=1円換算
                health: health
            },
            history: history,
            learningLogs: parsedLearningLogs,
            transactionLogs: parsedTrxLogs,
            knowledgeThemes: knowledgeThemes
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
