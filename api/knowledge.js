/**
 * ARS Knowledge API - v1.0
 * データベースから現在学習済みの法律とNGキーワード一覧を取得する
 */

const restUrlKey = Object.keys(process.env).find(key => key.includes('_REST_API_URL'));
const restTokenKey = Object.keys(process.env).find(key => key.includes('_REST_API_TOKEN'));

if (restUrlKey && restTokenKey && !process.env.KV_REST_API_URL) {
    process.env.KV_REST_API_URL = process.env[restUrlKey];
    process.env.KV_REST_API_TOKEN = process.env[restTokenKey];
}
const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        // KVから学習済みの全法律データを取得
        const rules = await kv.get('ars_knowledge:rules') || [];
        
        return res.status(200).json({ success: true, knowledge: rules });
    } catch (error) {
        console.error("Knowledge API Error:", error);
        return res.status(500).json({ error: error.message });
    }
};
