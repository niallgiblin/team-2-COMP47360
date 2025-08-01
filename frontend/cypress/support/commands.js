// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************

// Custom command to login a user
Cypress.Commands.add('login', (username = 'testuser', password = 'password123') => {
  cy.visit('/login')
  cy.get('[data-testid="username-input"]').type(username)
  cy.get('[data-testid="password-input"]').type(password)
  cy.get('[data-testid="login-button"]').click()
  // Wait for redirect and authentication to complete
  cy.url().should('include', '/')
  cy.wait(2000) // Give auth state time to update
})

// Custom command to register a new user
Cypress.Commands.add('register', (userData = {}) => {
  const defaultUser = {
    username: 'testuser',
    email: 'test@example.com',
    password: 'password123',
    firstName: 'Test',
    lastName: 'User'
  }
  const user = { ...defaultUser, ...userData }
  
  cy.visit('/signup')
  cy.get('[data-testid="username-input"]').type(user.username)
  cy.get('[data-testid="email-input"]').type(user.email)
  cy.get('[data-testid="password-input"]').type(user.password)
  cy.get('[data-testid="firstName-input"]').type(user.firstName)
  cy.get('[data-testid="lastName-input"]').type(user.lastName)
  cy.get('[data-testid="signup-button"]').click()
  // Wait for redirect and authentication to complete
  cy.url().should('include', '/')
  cy.wait(2000) // Give auth state time to update
})

// Custom command to search for venues
Cypress.Commands.add('searchVenues', (searchTerm) => {
  cy.get('[data-testid="search-input"]').type(searchTerm)
  cy.get('[data-testid="search-button"]').click()
})

// Custom command to wait for map to load
Cypress.Commands.add('waitForMap', () => {
  cy.get('[data-testid="map-container"]').should('be.visible')
  cy.wait(2000) // Give map time to fully load
})

// Custom command to add a venue to favorites
Cypress.Commands.add('addToFavorites', (venueName) => {
  cy.contains(venueName).parent().find('[data-testid="favorite-button"]').click()
})

// Custom command to create a plan
Cypress.Commands.add('createPlan', (planName, venues = []) => {
  cy.get('[data-testid="create-plan-button"]').click()
  cy.get('[data-testid="plan-name-input"]').type(planName)
  
  venues.forEach(venue => {
    cy.get('[data-testid="add-venue-button"]').click()
    cy.get('[data-testid="venue-search-input"]').type(venue)
    cy.get('[data-testid="venue-option"]').first().click()
  })
  
  cy.get('[data-testid="save-plan-button"]').click()
}) 