/**
 * ARS Environment Inspector
 * どの環境変数が生きているかをリストアップし、接続のヒントを探す
 */

module.exports = async (req, res) => {
    // セキュリティのため、値そのものは表示せず「キー名」と「文字数」のみを返す
    const envSummary = Object.keys(process.env).map(key => {
        const val = process.env[key] || "";
        return {
            key: key,
            length: val.length,
            prefix: val.substring(0, 5) + "..."
        };
    }).filter(e => e.key.includes('KV') || e.key.includes('REST') || e.key.includes('URL') || e.key.includes('API'));

    return res.status(200).json({
        detected_vars: envSummary,
        node_version: process.version,
        timestamp: new Date().toISOString()
    });
};
