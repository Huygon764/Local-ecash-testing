import { test } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// Load seeds data
const seedsPath = path.join(process.cwd(), 'data', 'seeds.json');
const botName = 'bobobo_botbot';
let recoveryPhrase: string, phoneNumber: string, phoneCode: string;

try {
  const seedsData = JSON.parse(fs.readFileSync(seedsPath, 'utf8'));
  const walletType = process.env.CI ? 'ciTestWallet' : 'testWallet';
  ({ recoveryPhrase, phoneNumber, phoneCode } = seedsData[walletType]);
  console.log(`Using ${walletType} for testing`);
} catch (error) {
  console.error('Error loading seeds.json. Ensure seeds.template.json is copied and filled in.');
  throw error;
}

// Increase timeout for the test
test.setTimeout(180000); // 3 minutes

// Authentication test
test.describe('@auth', () => {
  test('Generate auth state for LocaleCash', async ({ browser }) => {
    const context = await browser.newContext();
    await context.clearCookies();

    const page = await context.newPage();
    await page.goto('https://escrow.test');

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

    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait for 2 seconds

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
    const authPath = path.join(folderAuthData, 'auth.json');
    const indexedDBPath = path.join(folderAuthData, 'indexeddb-data.json');

    console.log('Saving authentication state and IndexedDB data...');

    try {
      await context.storageState({ path: authPath });
      fs.writeFileSync(indexedDBPath, JSON.stringify(indexedDBData, null, 2));
      console.log('Auth state and IndexedDB data saved successfully.');
    } catch (error) {
      console.error('Failed to save state:', error);
      throw error;
    } finally {
      await context.close();
    }
  });
});
