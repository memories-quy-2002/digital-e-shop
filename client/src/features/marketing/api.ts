import http from "../../lib/http";

export async function subscribeToMarketing(email: string): Promise<void> {
    await http.post("/api/marketing/subscribe", { email, source: "footer" });
}

export async function unsubscribeFromMarketing(token: string): Promise<void> {
    await http.post("/api/marketing/unsubscribe", { token });
}
