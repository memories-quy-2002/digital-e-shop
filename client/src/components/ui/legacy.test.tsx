import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./legacy";

describe("legacy Modal", () => {
    it("moves focus into the dialog when it opens", async () => {
        render(
            <Modal show onHide={vi.fn()}>
                <Modal.Header closeButton>
                    <Modal.Title>Review your order</Modal.Title>
                </Modal.Header>
                <Modal.Body>Order details</Modal.Body>
            </Modal>,
        );

        await waitFor(() => expect(screen.getByRole("button", { name: "Close" })).toHaveFocus());
    });
});
