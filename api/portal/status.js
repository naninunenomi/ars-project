/**
 * ARS Portal API: Status
 * 要塞の健康状態、学習中ステータス、キューを返す
 */

const redis = async (command, ...args) => {
    const url = (process.env.KV_REST_API_URL || "").trim();
    const token = (process.env.KV_REST_API_TOKEN || "").trim();
    const cleanUrl = url.replace(/\/$/, "");
    const res = await fetch(cleanUrl, {
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
        // 1. 金庫のテーマ一覧を取得
        const knowledgeKeys = await redis('hkeys', 'ars_v12_knowledge') || [];
        const checklistKeys = await redis('hkeys', 'ars_v12_checklist') || [];
        
        // 2. 現在勉強中のステータスを取得
        const statusArray = await redis('hgetall', 'ars_v12_status') || [];
        const studying = {};
        for (let i = 0; i < statusArray.length; i += 2) {
            studying[statusArray[i]] = statusArray[i + 1];
        }

        // 3. 待機キューを取得
        const queueArray = await redis('zrevrange', 'ars_v12_queue', 0, -1, 'WITHSCORES') || [];
        const queue = [];
        for (let i = 0; i < queueArray.length; i += 2) {
            queue.push({ theme: queueArray[i], score: queueArray[i + 1] });
        }

        // 推定節約コスト（1APIコールあたり0.1円として換算等、将来のためのプレースホルダー）
        const estimatedSavings = knowledgeKeys.length * 150; // 1マニュアル作成にかかる人間コスト換算（仮）

        res.json({
            stats: {
                totalManuals: knowledgeKeys.length,
                totalChecklists: checklistKeys.length,
                studyingCount: Object.keys(studying).length,
                queueCount: queue.length,
                estimatedSavings: estimatedSavings
            },
            studying,
            queue,
            system: "ALL GREEN"
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
