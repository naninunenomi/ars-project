/**
 * ARS Model Discovery API
 * 実際に使用可能なGeminiモデルの一覧を取得する診断用API
 */

const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is missing.' });
    }

    try {
        // v1 のモデル一覧を取得するエンドポイント
        const apiUrl = `https://generativelanguage.googleapis.com/v1/models?key=${process.env.GEMINI_API_KEY}`;
        
        const response = await fetch(apiUrl);
        const data = await response.json();

        // 診断結果をKVに保存（ダッシュボードで確認するため）
        await kv.set('ars_model_diagnosis', data);

        res.status(200).json(data);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
