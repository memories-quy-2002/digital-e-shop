import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ComparisonProvider } from '../../../../context/ComparisonContext';
import { LocaleProvider } from '../../../../context/LocaleContext';
import type { ProductWithAttributes } from '../../api';
import ProductComparisonPage from '../ProductComparisonPage';

const mocks = vi.hoisted(() => ({
  addItem: vi.fn(),
  addToast: vi.fn(),
  fetchProductComparison: vi.fn(),
}));

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    fetchProductComparison: mocks.fetchProductComparison,
  };
});

vi.mock('../../../../components/layout/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../../../../context/CartContext', () => ({
  useCart: () => ({ addItem: mocks.addItem }),
}));

vi.mock('../../../../context/ToastContext', () => ({
  useToast: () => ({ addToast: mocks.addToast }),
}));

const makeProduct = (
  overrides: Partial<ProductWithAttributes> = {},
): ProductWithAttributes => ({
  id: 12,
  name: 'Laptop A',
  sku: 'LAPTOP-A',
  manufacturerPartNumber: null,
  warrantyMonths: 24,
  category: 'Laptops',
  brand: 'Digital-E',
  price: 20_000_000,
  sale_price: 18_000_000,
  rating: 4.5,
  reviews: 12,
  main_image: '',
  stock: 8,
  available_stock: 8,
  description: 'A comparison fixture.',
  specifications: 'Display: 14 inch, Weight: 1.2 kg',
  attributes: [
    {
      id: 'memory',
      key: 'memory',
      label: 'Memory',
      type: 'text',
      value: '16 GB',
      unit: '',
      filterable: true,
    },
  ],
  ...overrides,
});

const comparisonResponse = (products: ProductWithAttributes[]) => ({
  category: { name: 'Laptops' },
  products,
});

function renderPage(initialEntry = '/compare?ids=12,18') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocaleProvider>
        <ComparisonProvider>
          <ProductComparisonPage />
        </ComparisonProvider>
      </LocaleProvider>
    </MemoryRouter>,
  );
}

describe('ProductComparisonPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    mocks.addItem.mockResolvedValue(true);
  });

  it('renders a semantic comparison table with current VND pricing', async () => {
    mocks.fetchProductComparison.mockResolvedValue(
      comparisonResponse([
        makeProduct(),
        makeProduct({
          id: 18,
          name: 'Laptop B',
          price: 22_000_000,
          sale_price: null,
          attributes: [
            {
              id: 'memory',
              key: 'memory',
              label: 'Memory',
              type: 'text',
              value: '32 GB',
              unit: '',
              filterable: true,
            },
          ],
        }),
      ]),
    );

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Compare products' })).toBeInTheDocument();
    expect(screen.getByText(/18\.000\.000/)).toBeInTheDocument();
    expect(screen.getByText(/22\.000\.000/)).toBeInTheDocument();
    expect(screen.getAllByText(/12 customer reviews/)).toHaveLength(2);
    expect(screen.getByRole('checkbox', { name: 'Show differences only' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Specifications' })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Memory/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Laptop A from comparison' })).toBeInTheDocument();
  });

  it('keeps add-to-cart disabled for products with no available stock', async () => {
    mocks.fetchProductComparison.mockResolvedValue(
      comparisonResponse([
        makeProduct({ stock: 0, available_stock: 0 }),
        makeProduct({ id: 18, name: 'Laptop B' }),
      ]),
    );

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Compare products' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Laptop A to cart' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add Laptop B to cart' })).not.toBeDisabled();
  });

  it('shows a meaningful category mismatch error and supports retry', async () => {
    mocks.fetchProductComparison
      .mockRejectedValueOnce({ response: { data: { code: 'COMPARE_CATEGORY_MISMATCH' } } })
      .mockResolvedValueOnce(comparisonResponse([makeProduct(), makeProduct({ id: 18, name: 'Laptop B' })]));

    renderPage();

    expect(await screen.findByText('Products from different categories cannot be compared together.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Compare products' })).toBeInTheDocument();
    expect(mocks.fetchProductComparison).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid comparison links before making an API request', async () => {
    renderPage('/compare?ids=0,18');

    expect(await screen.findByText('This comparison link is invalid.')).toBeInTheDocument();
    expect(mocks.fetchProductComparison).not.toHaveBeenCalled();
  });

  it('explains that one product is not enough for comparison', async () => {
    renderPage('/compare?ids=12');

    expect(await screen.findByText('Select at least two products to compare.')).toBeInTheDocument();
    await waitFor(() => expect(mocks.fetchProductComparison).not.toHaveBeenCalled());
  });
});
