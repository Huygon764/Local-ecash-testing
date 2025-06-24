# Local eCash Test Project

This project contains end-to-end tests for the Local eCash application using Playwright.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure test data:
   - Copy `data/seeds.template.json` to `data/seeds.json`
   - Update the `testWallet` section with your development test credentials
   - Update the `prodWallet` section with your production test credentials

## Running Tests

Run all tests (excluding auth):
```bash
npx playwright test
```

Tests are automatically run in GitHub Actions:
- On push to main/master
- On pull requests to main/master
- Every 6 hours (scheduled)
- Can be triggered manually in GitHub Actions

### Authentication Tests

The authentication tests are excluded from regular test runs to prevent unintended authentication attempts. To run authentication tests:

```bash
# Run all auth tests for development environment
npx playwright test --grep @auth

# Run specific auth test file for development
npx playwright test generate-auth.spec.ts --grep @auth

# Run auth tests for production environment
npx playwright test --grep @prod-auth
```

These tests will:
1. Log in to the application
2. Import the wallet
3. Save authentication state and IndexedDB data for future test runs

### Production Tests

Production tests are tagged with @prod and use separate authentication files. To run production tests:

```bash
# First time setup: Generate production auth state
npx playwright test --grep @prod-auth

# Run all production tests
npx playwright test --grep @prod

# Run specific production test file
npx playwright test localecash-prod.spec.ts
```

Note: Make sure to update the offer ID in `localecash-prod.spec.ts` with your actual production offer ID before running the tests.
