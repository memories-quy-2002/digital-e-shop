export const API_BASE_URL =
    process.env.NODE_ENV === "production"
        ? "https://e-commerce-express-server-app.vercel.app"
        : "http://localhost:4000";
