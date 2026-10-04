import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ShopsPage from "../ShopsPage";
import { LocaleProvider } from "../../context/LocaleContext";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  addToast: vi.fn(),
  addItem: vi.fn(),
}));
vi.mock("../../api/axios", () => ({ default: { get: mocks.get } }));
vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ userData: null }),
}));
vi.mock("../../context/ToastContext", () => ({
  useToast: () => ({ addToast: mocks.addToast }),
}));
vi.mock("../../context/CartContext", () => ({
  useCart: () => ({ addItem: mocks.addItem }),
}));
vi.mock("../../context/ComparisonContext", () => ({
  useComparison: () => ({ isSelected: () => false, toggle: vi.fn() }),
}));
vi.mock("../../components/layout/Header", () => ({ Header: () => null }));
vi.mock("../../components/layout/Footer", () => ({ default: () => null }));
vi.mock("../../features/products/components/ComparisonTray", () => ({
  default: () => null,
}));

const product = {
  id: 1,
  name: "Current laptop",
  category: "Laptop",
  brand: "Dell",
  price: 1000000,
  sale_price: null,
  stock: 5,
  available_stock: 5,
  rating: 4,
  reviews: 0,
  main_image: "",
  description: "Laptop",
  specifications: "",
  attributes: [],
};
const response = (name: string, total = 1) => ({
  status: 200,
  data: {
    products: total ? [{ ...product, name }] : [],
    pagination: { page: 1, limit: 6, total, totalPages: 1 },
  },
});
type ProductResponse = ReturnType<typeof response>;
const deferred = () => {
  let resolve!: (value: ProductResponse) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<ProductResponse>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const renderCatalog = (locale = "en", entry = "/shops") => {
  localStorage.setItem("digital-e:locale:v1", JSON.stringify(locale));
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <LocaleProvider>
        <HelmetProvider>
          <ShopsPage />
        </HelmetProvider>
      </LocaleProvider>
    </MemoryRouter>,
  );
};

describe("catalog request reliability", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  const arrange = (
    load: (
      config: { signal?: AbortSignal } | undefined,
      url: string,
    ) => Promise<ProductResponse>,
  ) => {
    mocks.get.mockImplementation(
      (url: string, config?: { signal?: AbortSignal }) => {
        if (url === "/api/products/facets")
          return Promise.resolve({
            status: 200,
            data: {
              facets: {
                categories: [],
                brands: [],
                minPrice: 0,
                maxPrice: 100000000,
                totalProducts: 1,
              },
            },
          });
        if (url.startsWith("/api/products?")) return load(config, url);
        throw new Error("Unexpected request: " + url);
      },
    );
  };

  it("keeps the newest results when an older request resolves last", async () => {
    const older = deferred();
    const newer = deferred();
    let newestRequested = false;
    arrange((_config, url) => {
      if (url.includes("sortBy=price-desc")) {
        newestRequested = true;
        return newer.promise;
      }
      return older.promise;
    });
    renderCatalog();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Sort product results" }),
      { target: { value: "price-desc" } },
    );
    await waitFor(() => expect(newestRequested).toBe(true));
    await act(async () => newer.resolve(response("Newest laptop")));
    expect(await screen.findByText("Newest laptop")).toBeInTheDocument();
    await act(async () => older.resolve(response("Stale laptop", 99)));
    expect(screen.queryByText("Stale laptop")).not.toBeInTheDocument();
    expect(screen.getByText("1 matching products")).toBeInTheDocument();
  });

  it("does not stop loading or show an error when an obsolete request fails", async () => {
    const older = deferred();
    const newer = deferred();
    let newestRequested = false;
    arrange((_config, url) => {
      if (url.includes("sortBy=price-desc")) {
        newestRequested = true;
        return newer.promise;
      }
      return older.promise;
    });
    renderCatalog();
    fireEvent.change(
      screen.getByRole("combobox", { name: "Sort product results" }),
      { target: { value: "price-desc" } },
    );
    await waitFor(() => expect(newestRequested).toBe(true));
    await act(async () => older.reject(new Error("obsolete failure")));
    expect(screen.getByText("Loading products...")).toBeInTheDocument();
    expect(mocks.addToast).not.toHaveBeenCalled();
    await act(async () => newer.resolve(response("Newest laptop")));
    expect(await screen.findByText("Newest laptop")).toBeInTheDocument();
  });

  it.each([
    ["en", "Unable to load products", "Try again"],
    ["vi", "Không thể tải sản phẩm", "Thử lại"],
  ])(
    "distinguishes an API failure from empty results and recovers in %s",
    async (locale, title, retry) => {
      let recovered = false;
      let recoveredQuery = "";
      arrange((_config, url) => {
        if (recovered) {
          recoveredQuery = url;
          return Promise.resolve(response("Recovered laptop"));
        }
        return Promise.reject(new Error("503"));
      });
      renderCatalog(locale, "/shops?categories=Laptop&sortBy=price-desc");
      expect(await screen.findByRole("alert")).toHaveTextContent(title);
      expect(
        screen.queryByText("No products match these filters."),
      ).not.toBeInTheDocument();
      recovered = true;
      fireEvent.click(screen.getByRole("button", { name: retry }));
      expect(await screen.findByText("Recovered laptop")).toBeInTheDocument();
      const query = new URL(recoveredQuery, "http://localhost").searchParams;
      expect(query.get("categories")).toBe("Laptop");
      expect(query.get("sortBy")).toBe("price-desc");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    },
  );

  it("keeps a successful empty result distinct from a failure", async () => {
    arrange(() => Promise.resolve(response("", 0)));
    renderCatalog();
    expect(
      await screen.findByText("No products match these filters."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("aborts its pending request when unmounted", async () => {
    let signal: AbortSignal | undefined;
    arrange((config) => {
      signal = config?.signal;
      return deferred().promise;
    });
    const view = renderCatalog();
    await waitFor(() => expect(mocks.get).toHaveBeenCalled());
    view.unmount();
    expect(signal?.aborted).toBe(true);
  });
});
