import axios from "axios";

declare module "axios" {
    export interface AxiosRequestConfig {
        handlerEnabled?: boolean;
    }
}

// Create an Axios instance with the required configuration
export default axios.create({
    baseURL: "https://e-commerce-express-server-app.vercel.app/", // Your server's base URL
    // baseURL: "http://localhost:4000",
    withCredentials: true, // This is crucial for sending cookies in cross-origin requests
    handlerEnabled: true, // This is optional and can be set or overridden in specific requests
});
