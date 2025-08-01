describe('Navigation Tests', () => {
  beforeEach(() => {
    cy.visit('/')
  })

  it('should display navigation bar', () => {
    cy.get('[data-testid="nav-bar"]').should('be.visible')
  })

  it('should navigate to home page', () => {
    cy.get('[data-testid="home-link"]').click()
    cy.url().should('eq', Cypress.config().baseUrl + '/')
  })

  it('should navigate to about page', () => {
    cy.get('[data-testid="about-link"]').click()
    cy.url().should('include', '/about')
  })

  it('should navigate to login page', () => {
    cy.get('[data-testid="login-link"]').click()
    cy.url().should('include', '/login')
  })

  it('should navigate to signup page', () => {
    cy.get('[data-testid="signup-link"]').click()
    cy.url().should('include', '/signup')
  })

  it('should show main navigation links', () => {
    cy.get('[data-testid="home-link"]').should('be.visible')
    cy.get('[data-testid="about-link"]').should('be.visible')
  })
}) 