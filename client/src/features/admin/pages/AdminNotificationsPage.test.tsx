import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminNotificationsPage from "./AdminNotificationsPage";
import { fetchAdminAlerts } from "../api";

vi.mock("../api", () => ({ fetchAdminAlerts: vi.fn() }));
vi.mock("../../../components/layout/AdminLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../../../context/ToastContext", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("react-router-dom", async () => ({
    ...(await vi.importActual<typeof import("react-router-dom")>("react-router-dom")),
    useNavigate: () => vi.fn(),
}));

describe("AdminNotificationsPage request states", () => {
    beforeEach(() => vi.clearAllMocks());

    it("shows a retryable error instead of the empty state when loading fails", async () => {
        vi.mocked(fetchAdminAlerts).mockRejectedValue({ response: { status: 500 } });
        render(<AdminNotificationsPage />);

        expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load admin data");
        expect(screen.queryByText("No matching notifications")).not.toBeInTheDocument();
    });

    it("keeps the fulfilled empty state", async () => {
        vi.mocked(fetchAdminAlerts).mockResolvedValue({ alerts: [], unread: 0 });
        render(<AdminNotificationsPage />);

        await waitFor(() => expect(screen.getByText("No matching notifications")).toBeInTheDocument());
    });
});
