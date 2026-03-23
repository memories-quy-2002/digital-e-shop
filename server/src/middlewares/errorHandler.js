const errorHandler = (err, req, res, next) => {
    if (err && err.code === "EBADCSRFTOKEN") {
        return res.status(403).json({ error: "Invalid CSRF token" });
    }
    console.error(err.stack || err);
    res.status(500).json({ error: "Something broke!" });
};

module.exports = errorHandler;
