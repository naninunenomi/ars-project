const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        // オートパイロット状態の更新 (POST)
        if (req.method === 'POST') {
            const { autopilot } = req.body || {};
            await kv.set('ars_autopilot_status', !!autopilot);
            return res.status(200).json({ success: true });
        }

        // 基本統計の取得
        const [totalRevenue, totalTransactions, autopilotStatus] = await Promise.all([
            kv.get('ars_total_revenue') || 0,
            kv.get('ars_total_transactions') || 0,
            kv.get('ars_autopilot_status') || false
        ]);

        // 学習履歴と取引ログ
        const learningLogs = await kv.lrange('ars_learning_history', 0, 9) || [];
        const trxLogs = await kv.lrange('ars_transactions', 0, 14) || [];
        const knowledgeBase = await kv.hgetall('ars_knowledge_base') || {};

        const parsedLearningLogs = learningLogs.map(l => typeof l === 'string' ? JSON.parse(l) : l);
        const parsedTrxLogs = trxLogs.map(l => typeof l === 'string' ? JSON.parse(l) : l);

        res.status(200).json({
            summary: {
                totalRevenue: parseFloat(totalRevenue),
                totalTransactions: parseInt(totalTransactions),
                avgPrice: totalTransactions > 0 ? (totalRevenue / totalTransactions).toFixed(2) : "0.00",
                jpyProjection: Math.floor(parseFloat(totalRevenue) * 150),
                autopilot: !!autopilotStatus,
                health: { status: 'HEALTHY' }
            },
            learningLogs: parsedLearningLogs,
            transactionLogs: parsedTrxLogs,
            knowledgeThemes: Object.keys(knowledgeBase)
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
