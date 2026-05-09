/**
 * ARS Management Portal API - v10.0
 * 監督（経営者）が必要な情報をリロード時に一括提供する
 */

const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    try {
        // 1. 収益・統計情報の取得
        const totalRevenue = await kv.get('ars_total_revenue') || 0;
        
        // 直近7日間の日別統計を取得
        const today = new Date();
        const days = Array.from({length: 7}, (_, i) => {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            return d.toISOString().split('T')[0];
        });

        const dailyStats = {};
        for (const date of days) {
            const stats = await kv.hgetall(`ars_daily_stats:${date}`);
            if (stats) dailyStats[date] = stats;
        }

        // 2. 知識ライブラリ（階層構造）の取得
        const knowledgeBase = await kv.hgetall('ars_knowledge_base') || {};

        // 3. 学習状況（進行中・予定）の取得
        const learningQueue = await kv.lrange('ars_learning_queue', 0, 19) || [];
        const activeTopic = await kv.get('ars_active_research_topic') || null;
        const progress = activeTopic ? await kv.hget('ars_research_progress', activeTopic) : null;

        // 4. 直近の取引履歴
        const transactions = await kv.lrange('ars_transactions', 0, 19) || [];
        const parsedTrx = transactions.map(t => typeof t === 'string' ? JSON.parse(t) : t);

        res.status(200).json({
            summary: {
                totalRevenue: parseFloat(totalRevenue).toFixed(2),
                jpyEquivalent: Math.floor(totalRevenue * 150).toLocaleString(),
                lastUpdated: new Date().toISOString()
            },
            dailyStats,
            library: knowledgeBase,
            learning: {
                active: activeTopic,
                progress: progress,
                queue: learningQueue
            },
            transactions: parsedTrx
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
