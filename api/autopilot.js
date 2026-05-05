module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    // データベースを使わず、成功レスポンスだけを返す
    return res.status(200).json({ 
        success: true, 
        revenue: (0.5 + Math.random() * 0.7).toFixed(2),
        status: 'STANDALONE_ACTIVE' 
    });
};
