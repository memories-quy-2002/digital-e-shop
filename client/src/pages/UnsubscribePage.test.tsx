import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UnsubscribePage from "./UnsubscribePage";

const mocks = vi.hoisted(() => ({ unsubscribeFromMarketing: vi.fn() }));

vi.mock("../features/marketing/api", () => ({
    unsubscribeFromMarketing: mocks.unsubscribeFromMarketing,
}));
vi.mock("react-helmet-async", () => ({ Helmet: () => null }));

describe("UnsubscribePage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.unsubscribeFromMarketing.mockResolvedValue(undefined);
    });

    it("consumes the unsubscribe token without displaying it", async () => {
        render(
            <MemoryRouter initialEntries={["/unsubscribe?token=unsubscribe-token"]}>
                <UnsubscribePage />
            </MemoryRouter>,
        );

        await waitFor(() => expect(mocks.unsubscribeFromMarketing).toHaveBeenCalledWith("unsubscribe-token"));
        expect(await screen.findByText("You have been unsubscribed from marketing emails.")).toBeInTheDocument();
        expect(screen.queryByText("unsubscribe-token")).not.toBeInTheDocument();
    });
});
