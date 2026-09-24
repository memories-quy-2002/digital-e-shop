export const sanitizeTelemetryUrl = (
    rawUrl: string,
    origin: string,
): string => {
    try {
        const url = new URL(rawUrl, origin);
        url.username = "";
        url.password = "";
        url.search = "";
        url.hash = "";
        return url.toString();
    } catch {
        return "/";
    }
};
