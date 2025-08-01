describe('Form Validation Tests', () => {
  beforeEach(() => {
    cy.visit('/login')
  })

  it('should validate empty login form', () => {
    cy.get('[data-testid="login-form"]').submit()
    cy.get('[data-testid="error-message"]').should('be.visible')
  })

  it('should validate empty username field', () => {
    cy.get('[data-testid="password-input"]').type('password')
    cy.get('[data-testid="login-form"]').submit()
    cy.get('[data-testid="error-message"]').should('be.visible')
  })

  it('should validate empty password field', () => {
    cy.get('[data-testid="username-input"]').type('testuser')
    cy.get('[data-testid="login-form"]').submit()
    cy.get('[data-testid="error-message"]').should('be.visible')
  })

  it('should clear error when user starts typing', () => {
    cy.get('[data-testid="login-form"]').submit()
    cy.get('[data-testid="error-message"]').should('be.visible')
    cy.get('[data-testid="username-input"]').type('test')
    cy.get('[data-testid="error-message"]').should('not.exist')
  })
}) 