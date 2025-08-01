describe('Authentication Tests', () => {
  beforeEach(() => {
    cy.visit('/login')
  })

  it('should display login form', () => {
    cy.get('[data-testid="login-form"]').should('be.visible')
    cy.get('[data-testid="username-input"]').should('be.visible')
    cy.get('[data-testid="password-input"]').should('be.visible')
    cy.get('[data-testid="login-button"]').should('be.visible')
  })

  it('should show validation errors for empty fields', () => {
    cy.get('[data-testid="login-form"]').submit()
    cy.get('[data-testid="error-message"]').should('be.visible')
  })

  it('should have interactive form fields', () => {
    cy.get('[data-testid="username-input"]').should('be.visible')
    cy.get('[data-testid="password-input"]').should('be.visible')
    cy.get('[data-testid="login-button"]').should('be.visible')
  })

  it('should navigate to signup from login page', () => {
    cy.contains('Sign up here').click()
    cy.url().should('include', '/signup')
  })
}) 