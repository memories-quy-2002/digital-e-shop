import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "../button";

describe("Workbench Button", () => {
    it("renders the primary action with an accessible name and signal styling", () => {
        render(<Button>View product</Button>);

        const button = screen.getByRole("button", { name: "View product" });

        expect(button).toHaveClass("bg-signal");
        expect(button).toHaveClass("min-h-11");
    });
});
