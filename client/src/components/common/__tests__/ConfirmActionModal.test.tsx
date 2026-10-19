import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ConfirmActionModal from "../ConfirmActionModal";

describe("ConfirmActionModal", () => {
    it("shows the supplied localized processing label while confirming", () => {
        render(
            <ConfirmActionModal
                show
                title="Xóa sản phẩm"
                message="Xác nhận xóa?"
                confirmLabel="Xóa"
                cancelLabel="Hủy"
                processingLabel="Đang xử lý..."
                isConfirming
                onCancel={vi.fn()}
                onConfirm={vi.fn()}
            />,
        );

        expect(screen.getByRole("dialog", { name: "Xóa sản phẩm" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Đang xử lý..." })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Hủy" })).toBeDisabled();
    });

    it("keeps the existing English processing label as the default", () => {
        render(
            <ConfirmActionModal
                show
                title="Remove item"
                message="Confirm removal?"
                isConfirming
                onCancel={vi.fn()}
                onConfirm={vi.fn()}
            />,
        );

        expect(screen.getByRole("button", { name: "Processing..." })).toBeDisabled();
    });
});
