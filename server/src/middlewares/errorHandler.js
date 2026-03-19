const errorHandler = (err, req, res, next) => {
    console.error(err.stack || err);
    res.status(500).json({ error: "Something broke!" });
};

module.exports = errorHandler;
