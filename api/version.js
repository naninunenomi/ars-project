module.exports = (req, res) => {
    res.status(200).json({ version: "1.5.1-bulk-mode", timestamp: new Date().toISOString() });
};
