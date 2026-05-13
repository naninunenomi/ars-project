/**
 * ARS Stats API - v10.1 (Robust Edition)
 */

// Redis Helper (Direct Fetch)
const redis = async (command, ...args) => {
    let rawUrl = (process.env.KV_REST_API_URL || "").trim();
    let url = rawUrl.startsWith("http") ? rawUrl : "https://pretty-llama-117521.upstash.io";
    let rawToken = (process.env.KV_REST_API_TOKEN || "").trim();
    let token = rawToken.length > 10 ? rawToken : "gQAAAAAAAcsRAAIgcDIzMTUxOGQzNmY5Yzg0ZjE1YTA0OWE4YWRmNzc2N2E3NQ";

    const res = await fetch(`${url}/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify([command, ...args])
    });
    const data = await res.json();
    return data.result;
};

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
        const totalRevenue = await redis('get', 'ars_total_revenue') || 0;
        
        // 7日間の履歴取得
        const dailyStats = {};
        for (let i = 0; i < 7; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            const stats = await redis('hgetall', `ars_daily_stats:${dateStr}`) || {};
            // hgetallの戻り値形式を整形 (Upstash REST APIは配列 [key, val, key, val...] を返す)
            const formatted = {};
            if (Array.isArray(stats)) {
                for (let j = 0; j < stats.length; j += 2) formatted[stats[j]] = stats[j+1];
            } else {
                Object.assign(formatted, stats);
            }
            dailyStats[dateStr] = formatted;
        }

        const knowledgeBase = await redis('hgetall', 'ars_v12_knowledge') || {};
        const formattedLib = {};
        if (Array.isArray(knowledgeBase)) {
            for (let j = 0; j < knowledgeBase.length; j += 2) formattedLib[knowledgeBase[j]] = knowledgeBase[j+1];
        } else {
            Object.assign(formattedLib, knowledgeBase);
        }

        const activeTopic = await redis('get', 'ars_active_research_topic');
        const learningQueue = await redis('zrevrange', 'ars_v12_queue', 0, -1) || [];
        const rawTrx = await redis('lrange', 'ars_transactions', 0, 9) || [];
        const parsedTrx = rawTrx.map(t => JSON.parse(decodeURIComponent(t)));

        res.status(200).json({
            summary: {
                totalRevenue: parseFloat(totalRevenue).toFixed(2),
                jpyEquivalent: Math.floor(totalRevenue * 150).toLocaleString(),
                lastUpdated: new Date().toISOString()
            },
            dailyStats,
            library: formattedLib,
            learning: {
                active: activeTopic,
                queue: learningQueue
            },
            transactions: parsedTrx
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
