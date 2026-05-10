/**
 * ARS Stats API - v10.1 (Robust Edition)
 */

// Redis Helper (Direct Fetch)
const redis = async (command, ...args) => {
    // 環境変数の自動マッピング (KV_... がなくても _REST_API_URL を探す)
    let url = process.env.KV_REST_API_URL;
    let token = process.env.KV_REST_API_TOKEN;

    if (!url || !token) {
        const urlKey = Object.keys(process.env).find(k => k.includes('_REST_API_URL'));
        const tokenKey = Object.keys(process.env).find(k => k.includes('_REST_API_TOKEN'));
        if (urlKey && tokenKey) {
            url = process.env[urlKey];
            token = process.env[tokenKey];
        }
    }

    if (!url || !token) throw new Error("Missing KV environment variables. Please check Vercel Settings.");
    
    const res = await fetch(`${url}/${command}/${args.join('/')}`, {
        headers: { Authorization: `Bearer ${token}` }
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

        const knowledgeBase = await redis('hgetall', 'ars_knowledge_base') || {};
        const formattedLib = {};
        if (Array.isArray(knowledgeBase)) {
            for (let j = 0; j < knowledgeBase.length; j += 2) formattedLib[knowledgeBase[j]] = knowledgeBase[j+1];
        } else {
            Object.assign(formattedLib, knowledgeBase);
        }

        const activeTopic = await redis('get', 'ars_active_research_topic');
        const learningQueue = await redis('lrange', 'ars_learning_queue', 0, -1) || [];
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
