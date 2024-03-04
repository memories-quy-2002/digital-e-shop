import axios from "axios";
declare module "axios" {
	export interface AxiosRequestConfig {
		handlerEnabled: boolean;
	}
}
export default axios.create({
	baseURL: "http://localhost:4000",
	handlerEnabled: true,
});
