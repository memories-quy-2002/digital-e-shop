// Cypress E2E test for CartPage

describe('Cart Page', () => {
    beforeEach(() => {
        cy.visit('/cart');
    });

    it('should display the cart page', () => {
        cy.contains(/Shopping Cart/i).should('be.visible');
    });

    it('should list cart items', () => {
        cy.get('.cart-item').should('exist');
    });

    it('should allow checkout', () => {
        cy.contains('Checkout').click();
        cy.url().should('include', '/checkout');
    });
});
