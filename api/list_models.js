/**
 * ARS Model Diagnosis Tool
 * 監督のAPIキーで実際に使用可能なモデル名を一覧表示します
 */

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const key = process.env.GEMINI_API_KEY;
    
    if (!key) return res.json({ error: "GEMINI_API_KEY is missing in environment variables." });

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        const data = await response.json();
        
        // シンプルにモデル名だけを抽出
        const modelNames = data.models ? data.models.map(m => m.name) : data;
        
        res.status(200).json({
            status: "SUCCESS",
            api_version: "v1beta",
            available_models: modelNames
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
