import bootstrap from "../src/main";

export default async function handler(req: unknown, res: unknown) {
    const app = await bootstrap();
    const instance = app.getHttpAdapter().getInstance();
    return instance(req, res);
}

export const config = {
    api: {
        bodyParser: false,
        externalResolver: true,
    },
};
