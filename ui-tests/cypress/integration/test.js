describe('staging.haitianrelief.org', () => {
  it('works', () => {
    cy.visit('https://staging.haitianrelief.org')
    cy.contains('Haitian Relief Services')
  })
})
