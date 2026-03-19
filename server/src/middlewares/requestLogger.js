const requestLogger = (req, res, next) => {
    if (process.env.NODE_ENV !== "production") {
        console.log(`${req.method} request for '${req.url}'`);
    }
    next();
};

module.exports = requestLogger;
