describe('Basic Application Tests', () => {
  beforeEach(() => {
    cy.visit('/')
  })

  it('should load the home page successfully', () => {
    cy.get('[data-testid="nav-bar"]').should('be.visible')
    cy.get('[data-testid="login-link"]').should('be.visible')
    cy.get('[data-testid="signup-link"]').should('be.visible')
  })

  it('should navigate to login page', () => {
    cy.get('[data-testid="login-link"]').click()
    cy.url().should('include', '/login')
    cy.get('[data-testid="login-form"]').should('be.visible')
    cy.get('[data-testid="username-input"]').should('be.visible')
    cy.get('[data-testid="password-input"]').should('be.visible')
    cy.get('[data-testid="login-button"]').should('be.visible')
  })

  it('should navigate to signup page', () => {
    cy.get('[data-testid="signup-link"]').click()
    cy.url().should('include', '/signup')
  })

  it('should navigate to about page', () => {
    cy.get('[data-testid="about-link"]').click()
    cy.url().should('include', '/about')
  })

  it('should show main navigation links', () => {
    cy.get('[data-testid="home-link"]').should('be.visible')
    cy.get('[data-testid="about-link"]').should('be.visible')
  })
}) 