import { describe, expect, it, vi } from "vitest";
import http from "../../lib/http";
import {
  fetchProduct,
  fetchProductComparison,
  normalizeProductAttributes,
  productAttributeRowsToInputs,
  type ProductAttributeRow,
} from "./api";

vi.mock("../../lib/http", () => ({
  default: {
    get: vi.fn(),
  },
}));

const row = (overrides: Partial<ProductAttributeRow>): ProductAttributeRow => ({
  id: "test-row",
  key: "",
  label: "",
  type: "text",
  value: "",
  unit: "",
  filterable: true,
  ...overrides,
});

describe("product attribute API mapping", () => {
  it("normalizes typed API attributes from snake_case fields", () => {
    expect(
      normalizeProductAttributes([
        {
          id: 10,
          attribute_key: "VRAM GB",
          label: "VRAM",
          value_type: "number",
          number_value: "12",
          unit: "GB",
          filterable: 1,
        },
        {
          attribute_key: "memory_type",
          label: "Memory Type",
          value_type: "text",
          text_value: "GDDR7",
          filterable: 0,
        },
      ]),
    ).toEqual([
      {
        id: "10",
        key: "vram_gb",
        label: "VRAM",
        type: "number",
        value: "12",
        unit: "GB",
        filterable: true,
      },
      {
        id: "attribute-1-memory_type",
        key: "memory_type",
        label: "Memory Type",
        type: "text",
        value: "GDDR7",
        unit: "",
        filterable: false,
      },
    ]);
  });

  it("normalizes the keyed JSON shape used by product list queries", () => {
    expect(normalizeProductAttributes({
      socket: { label: "Socket", type: "text", value: "AM5", filterable: 1 },
      vram_gb: { label: "VRAM", type: "number", value: 12, unit: "GB", filterable: 1 },
    })).toEqual([
      { id: "attribute-0-socket", key: "socket", label: "Socket", type: "text", value: "AM5", unit: "", filterable: true },
      { id: "attribute-1-vram_gb", key: "vram_gb", label: "VRAM", type: "number", value: "12", unit: "GB", filterable: true },
    ]);
  });

  it("maps text and number rows to the discriminated API payload", () => {
    expect(
      productAttributeRowsToInputs([
        row({
          key: " VRAM GB ",
          label: "VRAM",
          type: "number",
          value: "12",
          unit: "GB",
        }),
        row({
          id: "text",
          key: "memory_type",
          label: "Memory Type",
          value: "GDDR7",
        }),
      ]),
    ).toEqual([
      {
        key: "vram_gb",
        label: "VRAM",
        type: "number",
        numberValue: 12,
        unit: "GB",
        filterable: true,
      },
      {
        key: "memory_type",
        label: "Memory Type",
        type: "text",
        textValue: "GDDR7",
        filterable: true,
      },
    ]);
  });

  it("rejects duplicate normalized keys before submission", () => {
    expect(() =>
      productAttributeRowsToInputs([
        row({ key: "memory type", label: "Memory Type", value: "GDDR7" }),
        row({
          id: "duplicate",
          key: "memory_type",
          label: "Memory Type",
          value: "GDDR6",
        }),
      ]),
    ).toThrow("Duplicate attribute key: memory_type");
  });

  it("rejects non-numeric values for number rows", () => {
    expect(() =>
      productAttributeRowsToInputs([
        row({
          key: "wattage",
          label: "Wattage",
          type: "number",
          value: "not-a-number",
          unit: "W",
        }),
      ]),
    ).toThrow("Attribute wattage must contain a valid number.");
  });
});

describe("product lookup", () => {
  it("treats a missing product as an empty result for cached catalog entries", async () => {
    vi.mocked(http.get).mockRejectedValueOnce({ response: { status: 404 } });

    await expect(fetchProduct(901)).resolves.toBeNull();
  });

  it("fetches comparison products with the exact ordered ids query", async () => {
    vi.mocked(http.get).mockResolvedValueOnce({
      data: {
        comparison: {
          category: { name: "Laptops" },
          products: [{
            id: 12,
            name: "Laptop A",
            sku: "A",
            category: "Laptops",
            brand: "Digital-E",
            price: 20000000,
            sale_price: null,
            rating: 4.5,
            reviews: 2,
            main_image: null,
            stock: 0,
            description: "",
            specifications: null,
            attributes: {
              memory: { label: "Memory", type: "text", value: "16 GB" },
            },
          }],
        },
      },
    } as never);

    await expect(fetchProductComparison([18, 12])).resolves.toMatchObject({
      category: { name: "Laptops" },
      products: [{ id: 12, attributes: [{ key: "memory", value: "16 GB" }] }],
    });
    expect(http.get).toHaveBeenLastCalledWith("/api/products/compare", {
      params: { ids: "18,12" },
    });
  });
});
