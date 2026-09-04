import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProductGridSkeleton } from "../StorefrontSkeleton";

describe("ProductGridSkeleton", () => {
    it("exposes a loading status while preserving the product grid shape", () => {
        render(<ProductGridSkeleton count={3} />);

        expect(screen.getByRole("status", { name: "Loading products" })).toBeInTheDocument();
        expect(screen.getAllByTestId("product-skeleton-card")).toHaveLength(3);
    });
});
