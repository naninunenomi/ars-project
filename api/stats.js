/**
 * ARS Stats API - v7.0 (Hardcore Standalone)
 * Vercelの環境変数バグを回避するため、ライブラリを使わず直接Upstash APIを叩く
 */

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    const UPSTASH_URL = "https://expert-lamb-67610.upstash.io";
    const UPSTASH_TOKEN = "gQAAAAAAAQgaAAIgcDE3ODU3NWY3NWY5NmU0NDhjYWZmMWUzYmExMmM0MDdmOA";

    // 汎用的なRedis呼び出し関数
    const redis = async (command, ...args) => {
        const response = await fetch(`${UPSTASH_URL}/${command}/${args.join('/')}`, {
            headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
        });
        const data = await response.json();
        return data.result;
    };

    try {
        if (req.method === 'POST') {
            const { autopilot } = req.body || {};
            await redis('set', 'ars_autopilot_status', !!autopilot ? 'true' : 'false');
            return res.status(200).json({ success: true });
        }

        const totalRevenue = parseFloat(await redis('get', 'ars_total_revenue') || 0);
        const totalTransactions = parseInt(await redis('get', 'ars_total_transactions') || 0);
        const autopilotStatus = (await redis('get', 'ars_autopilot_status')) === 'true';

        res.status(200).json({
            summary: {
                totalRevenue,
                totalTransactions,
                avgPrice: totalTransactions > 0 ? (totalRevenue / totalTransactions).toFixed(2) : "0.00",
                jpyProjection: Math.floor(totalRevenue * 150),
                autopilot: autopilotStatus,
                health: { status: 'STANDALONE_REST_ACTIVE' }
            },
            learningLogs: [], // 後ほど復旧
            transactionLogs: [], // 後ほど復旧
            knowledgeThemes: []
        });

    } catch (error) {
        res.status(200).json({ error: "BYPASS_FAILED", detail: error.message });
    }
};
