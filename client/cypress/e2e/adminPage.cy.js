// Cypress E2E test for AdminPage

describe('Admin Page', () => {
    beforeEach(() => {
        cy.visit('/admin');
    });

    it('should display the admin dashboard', () => {
        cy.contains('Admin Dashboard').should('be.visible');
    });

    it('should list products', () => {
        cy.contains('Products').click();
        cy.url().should('include', '/admin/products');
    });

    it('should allow navigation to orders', () => {
        cy.contains('Orders').click();
        cy.url().should('include', '/admin/orders');
    });
});
