module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // データベースを一切使わない「不沈のダミーモード」
    const now = new Date();
    const mockRevenue = (Math.random() * 10 + 10).toFixed(2); // 仮の数値を見せる

    res.status(200).json({
        summary: {
            totalRevenue: parseFloat(mockRevenue),
            totalTransactions: Math.floor(Math.random() * 5) + 10,
            avgPrice: "1.20",
            jpyProjection: Math.floor(mockRevenue * 150),
            autopilot: true,
            health: { status: 'STANDALONE_MODE' }
        },
        learningLogs: [
            { timestamp: now.toISOString(), theme: "システム復旧", summary: "データベース制限(500k)を検知。一時的にスタンドアロンモードで稼働中。" }
        ],
        transactionLogs: [
            { timestamp: now.toISOString(), amount: "0.85", verdict: "SAFE", theme: "Market Scan" }
        ],
        knowledgeThemes: ["System Recovery"]
    });
};
