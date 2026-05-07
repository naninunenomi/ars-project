/**
 * ARS Stats API - v8.0 (Final Verified)
 * Using RAW REST FETCH for maximum reliability.
 */

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    const UPSTASH_URL = "https://pretty-llama-117521.upstash.io";
    const UPSTASH_TOKEN = "gQAAAAAAAcsRAAIgcDIzMTUxOGQzNmY5Yzg0ZjE1YTA0OWE4YWRmNzc2N2E3NQ";

    const redis = async (command, ...args) => {
        const url = `${UPSTASH_URL}/${command}${args.length ? '/' + args.join('/') : ''}`;
        const response = await fetch(url, { headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` } });
        const data = await response.json();
        return data.result;
    };

    try {
        if (req.method === 'POST') {
            const { autopilot } = req.body || {};
            await redis('set', 'ars_autopilot_status', !!autopilot ? 'true' : 'false');
            return res.status(200).json({ success: true });
        }

        const [totalRevenue, totalTransactions, autopilotStatus, learningLogs, trxLogs, knowledgeBase] = await Promise.all([
            redis('get', 'ars_total_revenue') || 0,
            redis('get', 'ars_total_transactions') || 0,
            redis('get', 'ars_autopilot_status'),
            redis('lrange', 'ars_learning_history', 0, 9) || [],
            redis('lrange', 'ars_transactions', 0, 14) || [],
            redis('hgetall', 'ars_knowledge_base') || {}
        ]);

        const parsedLearningLogs = (learningLogs || []).map(l => typeof l === 'string' ? JSON.parse(l) : l);
        const parsedTrxLogs = (trxLogs || []).map(l => typeof l === 'string' ? JSON.parse(l) : l);

        res.status(200).json({
            summary: {
                totalRevenue: parseFloat(totalRevenue || 0),
                totalTransactions: parseInt(totalTransactions || 0),
                avgPrice: totalTransactions > 0 ? (totalRevenue / totalTransactions).toFixed(2) : "0.00",
                jpyProjection: Math.floor(parseFloat(totalRevenue || 0) * 150),
                autopilot: autopilotStatus === 'true',
                health: { status: 'LIVE_REST_CONNECTED' }
            },
            learningLogs: parsedLearningLogs,
            transactionLogs: parsedTrxLogs,
            knowledgeThemes: Object.keys(knowledgeBase || {})
        });

    } catch (error) {
        res.status(200).json({ error: "REST_CONNECTION_ERROR", detail: error.message });
    }
};
