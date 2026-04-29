module.exports = (req, res) => {
    res.status(200).json({ status: "Synced-0849", timestamp: new Date().toISOString() });
};
