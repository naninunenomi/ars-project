/**
 * ARS Portal API: Library
 * 金庫に保管されているマニュアルとチェックリストの全データを取得する
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
        const themeToFetch = req.query.theme;

        if (themeToFetch) {
            // 特定のテーマの詳細（フルマニュアル）を取得
            const manual = await redis('hget', 'ars_v12_knowledge', themeToFetch);
            return res.json({ theme: themeToFetch, manual });
        } else {
            // 一覧の取得（チェックリストのみ取得して軽量化）
            const checklistArray = await redis('hgetall', 'ars_v12_checklist') || [];
            const library = [];
            
            for (let i = 0; i < checklistArray.length; i += 2) {
                library.push({
                    theme: checklistArray[i],
                    checklist: checklistArray[i + 1]
                });
            }
            
            res.json({ library });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
