import axios from "axios";
declare module "axios" {
    export interface AxiosRequestConfig {
        handlerEnabled?: boolean;
    }
}

const baseURL =
    process.env.NODE_ENV === "production"
        ? "https://e-commerce-express-server-app.vercel.app/"
        : "http://localhost:4000";

export default axios.create({
    baseURL,
    withCredentials: true,
    handlerEnabled: true,
});
