const ORDER_STATUS = Object.freeze({
    PENDING: 0,
    DONE: 1,
    CANCELED: 2,
});

const USER_ROLE = Object.freeze({
    CUSTOMER: "Customer",
    ADMIN: "Admin",
});

const USER_ACCOUNT_STATUS = Object.freeze({
    ACTIVE: "Active",
    SUSPENDED: "Suspended",
});

const PAYMENT_METHOD = Object.freeze({
    CASH: "cash",
    PAYOS: "payos",
});

const CURRENCY_CODE = Object.freeze({
    USD: "USD",
    VND: "VND",
});

module.exports = { ORDER_STATUS, USER_ROLE, USER_ACCOUNT_STATUS, PAYMENT_METHOD, CURRENCY_CODE };
