/**
 * ARS API Key Management Endpoint
 * 発行したAPIキー（通行手形）と残高を管理する
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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method === 'POST') {
        try {
            // Generate a random API key
            const randomString = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            const apiKey = `ars_live_${randomString}`;
            
            // 10,000 トークン（利用権）を初期付与
            const initialBalance = 10000;

            await kv.set(`apikey:${apiKey}`, initialBalance);

            return res.status(200).json({ 
                success: true, 
                apiKey: apiKey,
                balance: initialBalance
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: "Failed to generate API key" });
        }
    }

    if (req.method === 'GET') {
        try {
            // GETリクエストで特定のキーの残高を確認できる（開発用/UI更新用）
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ error: "Authorization header required" });
            }
            const token = authHeader.split(' ')[1];
            const balance = await kv.get(`apikey:${token}`);
            
            if (balance === null) {
                return res.status(404).json({ error: "API key not found" });
            }

            return res.status(200).json({ 
                success: true, 
                apiKey: token,
                balance: parseInt(balance)
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: "Failed to fetch balance" });
        }
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
};
