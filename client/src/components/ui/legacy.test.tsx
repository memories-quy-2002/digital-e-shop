import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

    it("keeps field focus when the onHide callback changes during form edits", async () => {
        const firstOnHide = vi.fn();
        const latestOnHide = vi.fn();
        const renderDialog = (onHide: () => void) => (
            <Modal show onHide={onHide}>
                <Modal.Header closeButton>
                    <Modal.Title>Manage product</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <label htmlFor="sale-price">Sale price</label>
                    <input id="sale-price" type="number" />
                </Modal.Body>
            </Modal>
        );
        const view = render(renderDialog(firstOnHide));
        const salePrice = screen.getByLabelText("Sale price");

        await waitFor(() => expect(screen.getByRole("button", { name: "Close" })).toHaveFocus());
        salePrice.focus();
        view.rerender(renderDialog(latestOnHide));

        expect(salePrice).toHaveFocus();
        fireEvent.keyDown(document, { key: "Escape" });
        expect(firstOnHide).not.toHaveBeenCalled();
        expect(latestOnHide).toHaveBeenCalledOnce();
    });
});
