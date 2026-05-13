const isProduction = process.env.NODE_ENV === "production";

const getRouteLimit = (productionLimit = 100) => (isProduction ? productionLimit : 10000);

module.exports = {
    getRouteLimit,
};
