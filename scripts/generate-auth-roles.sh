#!/bin/bash

# This script generates authentication states for wallet roles (Seller, Buyer, Arb)
# Usage: ./generate-auth-roles.sh [role1] [role2] ...
# If no roles are specified, it will generate auth for all three roles
# Example: ./generate-auth-roles.sh Seller Buyer
# Example: ./generate-auth-roles.sh  (This will run for all roles)

# Navigate to project root
cd "$(dirname "$0")/.."

# Create data-auth/local directory if it doesn't exist
mkdir -p data-auth/local

# Check if seeds.json exists, if not create it from template
if [ ! -f "data/seeds.json" ]; then
  echo "seeds.json not found. Creating from template..."
  cp data/seeds.template.json data/seeds.json
  echo "Please edit data/seeds.json to add your wallet recovery phrases and phone numbers"
  echo "Then run this script again"
  exit 1
fi

# Function to validate seeds.json has proper wallet data
validate_seeds_json() {
  local missing_wallets=()
  local json_content=$(cat data/seeds.json)
  
  # Check each wallet type
  for wallet in SellerLocalWallet BuyerLocalWallet ArbLocalWallet; do
    if ! echo "$json_content" | grep -q "\"$wallet\""; then
      missing_wallets+=("$wallet")
    else
      # Check if wallet has placeholder values
      local recovery_phrase=$(echo "$json_content" | grep -A 3 "\"$wallet\"" | grep "recoveryPhrase" | grep -o "\".*\"" | sed 's/"//g' | sed 's/^.*: //')
      if [[ "$recovery_phrase" == *"your"* ]] || [[ "$recovery_phrase" == *"here"* ]]; then
        echo "Warning: $wallet appears to have placeholder values. Please update it in data/seeds.json"
      fi
    fi
  done
  
  # If any wallets are missing, report and exit
  if [ ${#missing_wallets[@]} -gt 0 ]; then
    echo "Error: The following wallet types are missing from seeds.json:"
    for wallet in "${missing_wallets[@]}"; do
      echo "  - $wallet"
    done
    echo "Please update data/seeds.json to include all required wallet types"
    exit 1
  fi
}

# Validate seeds.json before proceeding
validate_seeds_json

# Function to generate auth for a specific role
generate_auth_for_role() {
  local role=$1
  echo "Generating authentication for $role role..."
  # Set environment variable for the role
  WALLET_ROLE="$role" npx playwright test tests/local/auth/generate-auth-local.spec.ts --project=chromium --headed
  echo "Completed authentication for $role role"
  echo "----------------------------------------"
}

# If specific roles are provided, only generate auth for those roles
if [ $# -gt 0 ]; then
  for role in "$@"; do
    # Normalize role name (capitalize first letter, lowercase rest)
    normalized_role=$(echo "$role" | awk '{print toupper(substr($0,1,1)) tolower(substr($0,2))}')
    if [[ "$normalized_role" =~ ^(Seller|Buyer|Arb)$ ]]; then
      generate_auth_for_role "$normalized_role"
    else
      echo "Error: Invalid role '$role'. Must be one of: Seller, Buyer, Arb"
      exit 1
    fi
  done
else
  # Generate auth for all roles
  for role in Seller Buyer Arb; do
    generate_auth_for_role $role
  done
fi

echo "Authentication generation complete!"
