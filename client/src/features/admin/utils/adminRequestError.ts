export type AdminRequestErrorKind = "auth" | "forbidden" | "network" | "unknown";

export type AdminRequestError = {
    kind: AdminRequestErrorKind;
    title: string;
    message: string;
};

type AxiosLikeError = {
    response?: { status?: number };
    request?: unknown;
};

export const getAdminRequestError = (error: unknown): AdminRequestError => {
    const candidate = error && typeof error === "object" ? (error as AxiosLikeError) : {};
    const status = candidate.response?.status;

    if (status === 401) {
        return { kind: "auth", title: "Admin session required", message: "Sign in again to load this admin data." };
    }

    if (status === 403) {
        return { kind: "forbidden", title: "Access denied", message: "Your account is not allowed to view this admin data." };
    }

    if (!candidate.response && candidate.request) {
        return { kind: "network", title: "Connection problem", message: "The admin data could not be reached. Check the connection and try again." };
    }

    return { kind: "unknown", title: "Unable to load admin data", message: "Something went wrong while loading this section. Try again." };
};
