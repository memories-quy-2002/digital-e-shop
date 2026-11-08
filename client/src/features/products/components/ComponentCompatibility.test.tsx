import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { normalizeProductWithAttributes, fetchProduct, fetchProductCatalog } from "../api";
import { ComponentCompatibility } from "./ComponentCompatibility";

vi.mock("../../../context/LocaleContext", () => ({ useLocale: () => ({ locale: "en" }) }));
vi.mock("../api", async (original) => ({
    ...await original<typeof import("../api")>(),
    fetchProductCatalog: vi.fn(),
    fetchProduct: vi.fn(),
}));

it("filters the catalog before paging and shows the selected socket evidence", async () => {
    const cpu = normalizeProductWithAttributes({ id: 1, name: "Example CPU", category: "CPU", attributes: [{ key: "socket", value: "AM5" }] });
    const board = normalizeProductWithAttributes({ id: 2, name: "Example board", category: "Motherboard", attributes: [{ key: "socket", value: "AM4" }] });
    vi.mocked(fetchProductCatalog).mockResolvedValue({ products: [board] });
    vi.mocked(fetchProduct).mockResolvedValue(board);

    render(<ComponentCompatibility product={cpu} />);
    fireEvent.change(screen.getByLabelText("Component name or model"), { target: { value: "Example" } });
    fireEvent.click(screen.getByRole("button", { name: "Find components" }));
    fireEvent.click(await screen.findByRole("button", { name: "Example board" }));

    expect(fetchProductCatalog).toHaveBeenCalledWith({ term: "Example", categories: "motherboard", page: "1", limit: "12" });
    expect(await screen.findByText("Example board: Specification conflict")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Socket · AM4 / AM5");
});
