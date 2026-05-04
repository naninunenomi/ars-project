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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // オートパイロット状態の更新 (POST)
    if (req.method === 'POST') {
        const { autopilot } = req.body || {};
        await kv.set('ars_autopilot_status', !!autopilot);
        return res.status(200).json({ success: true });
    }
    
    try {
        // 1. 基本統計
        const totalRevenue = parseFloat(await kv.get('ars_total_revenue') || 0);
        const totalTransactions = parseInt(await kv.get('ars_total_transactions') || 0);
        const autopilotStatus = await kv.get('ars_autopilot_status') || false;
        const health = await kv.get('ars_system_health') || { status: 'HEALTHY' };

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

        // 4. 取引ログ (直近15件)
        const trxLogs = await kv.lrange('ars_transactions', 0, 14) || [];
        const parsedTrxLogs = trxLogs.map(log => typeof log === 'string' ? JSON.parse(log) : log);

        // 5. 学習データの概要 (古い形式と新しい形式を統合して救済)
        const knowledgeBase = await kv.hgetall('ars_knowledge_base') || {};
        
        // 旧データ (ars_latest_knowledge 等) があればマージ
        const oldKnowledge = await kv.get('ars_latest_knowledge');
        if (oldKnowledge && !knowledgeBase['Imported Data']) {
            knowledgeBase['Recovered Wisdom'] = typeof oldKnowledge === 'string' ? oldKnowledge : JSON.stringify(oldKnowledge);
        }
        
        const knowledgeThemes = Object.keys(knowledgeBase);

        const avgPrice = totalTransactions > 0 ? (totalRevenue / totalTransactions).toFixed(2) : "0.00";

        res.status(200).json({
            summary: {
                totalRevenue: parseFloat(totalRevenue),
                totalTransactions: parseInt(totalTransactions),
                avgPrice: avgPrice,
                jpyProjection: Math.floor(parseFloat(totalRevenue)),
                autopilot: autopilotStatus,
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
