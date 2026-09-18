import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../../../context/LocaleContext';
import WishlistItem from '../WishlistItem';

const product = {
    id: 41,
    name: 'Studio headphones',
    sku: 'HEADPHONE-41',
    manufacturerPartNumber: null,
    warrantyMonths: 12,
    category: 'Headphone',
    brand: 'Audio Lab',
    price: 1_000_000,
    sale_price: null,
    rating: 4.8,
    reviews: 3,
    main_image: null,
    stock: 4,
    description: 'A demo product',
    specifications: 'Wireless',
};

describe('WishlistItem alerts', () => {
    it('renders both alert controls and sends the complete preference update', () => {
        const onAlertChange = vi.fn().mockResolvedValue(undefined);

        render(
            <LocaleProvider>
                <MemoryRouter>
                    <WishlistItem
                        item={{
                            id: 1,
                            product,
                            priceDropAlertEnabled: false,
                            backInStockAlertEnabled: false,
                        }}
                        selected={false}
                        onSelect={vi.fn()}
                        onMoveToCart={vi.fn()}
                        onRemoveWishlist={vi.fn()}
                        onAlertChange={onAlertChange}
                    />
                </MemoryRouter>
            </LocaleProvider>,
        );

        expect(screen.getByRole('checkbox', { name: /price drop/i })).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: /back in stock/i })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('checkbox', { name: /price drop/i }));

        expect(onAlertChange).toHaveBeenCalledWith(41, {
            priceDropEnabled: true,
            backInStockEnabled: false,
        });
    });
});
