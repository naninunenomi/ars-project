/**
 * ARS KV Debugger
 * 現在の環境変数と、KVに保存されているキーの「実在」を確認する
 */

const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
    try {
        // 1. 環境変数のスキャン（値そのものは隠しつつ、キー名だけ確認）
        const envKeys = Object.keys(process.env).filter(k => k.includes('KV_') || k.includes('REST_API'));
        
        // 2. KV内の全キーをスキャン（もし可能なら）
        // vercel/kv は keys() をサポートしていない場合があるため、主要なキーの存在確認
        const keysToCheck = [
            'ars_knowledge_base',
            'ars_learning_history',
            'ars_transactions',
            'ars_total_revenue',
            'ars_autopilot_status'
        ];
        
        const results = {};
        for (const key of keysToCheck) {
            const type = await kv.type(key);
            let detail = null;
            if (type === 'hash') detail = Object.keys(await kv.hgetall(key) || {}).length;
            if (type === 'list') detail = await kv.llen(key);
            if (type === 'string') detail = await kv.get(key);
            
            results[key] = { type, detail };
        }

        return res.status(200).json({
            connected_env_keys: envKeys,
            kv_snapshot: results,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
