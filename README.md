# Local eCash Test Project

This project contains end-to-end tests for the Local eCash application using Playwright.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure test data:
   - Copy `data/seeds.template.json` to `data/seeds.json`
   - Update the wallet sections with your credentials:
     - `SellerLocalWallet`: For the seller role in local tests
     - `BuyerLocalWallet`: For the buyer role in local tests
     - `ArbLocalWallet`: For the arbitrator role in local tests
     - `prodWallet`: For production tests

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

#### Role-based Authentication for Local Tests

For local testing, you can generate authentication states for different wallet roles (Seller, Buyer, Arbitrator):

```bash
# Generate auth for all roles (Seller, Buyer, Arb)
./scripts/generate-auth-roles.sh

# Generate auth for a specific role
./scripts/generate-auth-roles.sh Seller
./scripts/generate-auth-roles.sh Buyer
./scripts/generate-auth-roles.sh Arb

# Alternatively, you can use the environment variable directly
WALLET_ROLE=Seller npx playwright test tests/local/auth/generate-auth-local.spec.ts
```

These authentication tests will:
1. Log in to the application
2. Import the wallet based on the specified role
3. Save authentication state and IndexedDB data for future test runs in `data-auth/local/[role]-auth.json`

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
