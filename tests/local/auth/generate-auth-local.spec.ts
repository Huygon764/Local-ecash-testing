import { test } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

// Load seeds data
const seedsPath = path.join(process.cwd(), 'data', 'seeds.json');
const botName = process.env.LOCAL_BOT_NAME;
let recoveryPhrase: string, phoneNumber: string, phoneCode: string;
let walletRole = process.env.WALLET_ROLE || 'Seller';

const loadParams = async () => {
  // Simple validation for wallet role
  const validRoles = ['Seller', 'Buyer', 'Arb'];

  console.log(`Using wallet role: ${walletRole}`);

  if (!validRoles.includes(walletRole)) {
    throw new Error(`Invalid wallet role: ${walletRole}. Must be one of: ${validRoles.join(', ')}`);
  }

  // Map roles to wallet types in seeds.json
  const walletTypeMap = {
    'Seller': 'SellerLocalWallet',
    'Buyer': 'BuyerLocalWallet',
    'Arb': 'ArbLocalWallet'
  };

  try {
    const seedsData = JSON.parse(fs.readFileSync(seedsPath, 'utf8'));
    const walletType = process.env.CI ? 'ciTestWallet' : walletTypeMap[walletRole];
    ({ recoveryPhrase, phoneNumber, phoneCode } = seedsData[walletType]);
    console.log(`Using ${walletType} for testing as ${walletRole} role`);
  } catch (error) {
    console.error('Error loading seeds.json. Ensure seeds.template.json is copied and filled in.');
    throw error;
  }

}
// Increase timeout for the test
test.setTimeout(180000); // 3 minutes

// Authentication test
test.describe('@auth', () => {
  test(`Generate ${walletRole} auth state for LocaleCash`, async ({ browser }) => {
    await loadParams();
    const context = await browser.newContext();
    await context.clearCookies();

    const page = await context.newPage();
    await page.goto(process.env.LOCAL_LINK || 'https://escrow.test', { waitUntil: 'networkidle' });

    // Track OAuth popup URL
    let oauthUrl: string;
    page.on('popup', async (popup) => {
      oauthUrl = popup.url();
      if (!oauthUrl.includes('bot_id=')) {
        throw new Error('bot_id parameter missing from OAuth URL');
      }
    });

    // Start login process
    await page.locator('.MuiButtonBase-root').first().click();
    await page.getByRole('button', { name: 'Log In' }).click();
    await page.waitForLoadState('networkidle');

    const telegramLoginButton = page.locator(`#telegram-login-${botName}`).contentFrame()
      .getByRole('button', { name: 'Log in with Telegram' });

    await telegramLoginButton.waitFor({ state: 'visible' });
    await telegramLoginButton.click();

    const popup = await page.waitForEvent('popup');
    await popup.waitForLoadState('networkidle');

    // Enter phone details
    await popup.locator('#login-phone-code').fill(phoneCode);
    await popup.locator('#login-phone').fill(phoneNumber);
    await popup.getByRole('button', { name: 'Next' }).click();

    // Wallet import
    await page.getByRole('button', { name: 'Import' }).click();
    await page.getByRole('textbox', { name: 'Enter your recovery phrase (' }).fill(recoveryPhrase);
    await page.getByRole('button', { name: 'Import' }).click();

    console.log('Waiting for successful login and wallet import...');
    await page.waitForLoadState('networkidle');

    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds

    // Get IndexedDB data after wallet import
    const indexedDBData = await page.evaluate(async () => {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('escrow-indexeddb');

        request.onerror = (event) => {
          console.error('IndexedDB error:', event);
          reject(request.error);
        };

        request.onsuccess = async () => {
          const db = request.result;
          const data: Record<string, any> = {};
          const transaction = db.transaction('keyvaluepairs', 'readonly');
          const store = transaction.objectStore('keyvaluepairs');

          try {
            // Get all keys first
            const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
              const keysRequest = store.getAllKeys();
              keysRequest.onsuccess = () => resolve(keysRequest.result);
              keysRequest.onerror = () => reject(keysRequest.error);
            });

            console.log('Found IndexedDB keys:', keys);

            // Get values for all keys
            for (const key of keys) {
              if (typeof key === 'string') {
                const value = await new Promise((resolve, reject) => {
                  const request = store.get(key);
                  request.onsuccess = () => resolve(request.result);
                  request.onerror = () => reject(request.error);
                });
                data[key] = value;
                console.log(`Retrieved key: ${key}, value length: ${value ? JSON.stringify(value).length : 0}`);
              }
            }

            db.close();
            resolve(data);
          } catch (error) {
            console.error('Error accessing IndexedDB:', error);
            reject(error);
          }
        };
      });
    });
    // Save auth state and IndexedDB data
    const folderAuthData = path.join(process.cwd(), 'data-auth');
    const localAuthFolder = path.join(folderAuthData, 'local');

    // Create local folder if it doesn't exist
    if (!fs.existsSync(localAuthFolder)) {
      fs.mkdirSync(localAuthFolder, { recursive: true });
    }

    // Create role-specific auth files
    const authPath = path.join(localAuthFolder, `${walletRole.toLowerCase()}-auth.json`);
    const indexedDBPath = path.join(localAuthFolder, `${walletRole.toLowerCase()}-indexeddb-data.json`);

    console.log(`Saving authentication state and IndexedDB data for ${walletRole} role...`);

    try {
      // Save to role-specific location
      await context.storageState({ path: authPath });
      fs.writeFileSync(indexedDBPath, JSON.stringify(indexedDBData, null, 2));

      console.log(`Auth state and IndexedDB data saved successfully for ${walletRole} role.`);
      console.log(`Role-specific auth saved to: ${authPath}`);
      console.log(`Role-specific IndexedDB data saved to: ${indexedDBPath}`);
    } catch (error) {
      console.error('Failed to save state:', error);
      throw error;
    } finally {
      await context.close();
    }
  });
});
