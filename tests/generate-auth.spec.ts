import { test } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// Load seeds data
const seedsPath = path.join(process.cwd(), 'data', 'seeds.json');
let recoveryPhrase: string;
let phoneNumber: string;

try {
  const seedsData = JSON.parse(fs.readFileSync(seedsPath, 'utf8'));
  // Use CI test wallet if running in GitHub Actions, otherwise use regular test wallet
  const walletType = process.env.CI ? 'ciTestWallet' : 'testWallet';
  recoveryPhrase = seedsData[walletType].recoveryPhrase;
  phoneNumber = seedsData[walletType].phoneNumber;
  console.log(`Using ${walletType} for testing`);
} catch (error) {
  console.error('Error loading seeds.json. Make sure to copy seeds.template.json to seeds.json and fill in your recovery phrase and phone number.');
  throw error;
}

// Increase timeout for this test to allow manual login
test.setTimeout(180000); // 3 minutes

// Skip by default, only run when explicitly tagged with @auth
test.describe('@auth', () => {
  test.skip('Generate auth state for LocaleCash', async ({ browser }) => {
    // Create new browser context
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto('https://dev.localecash.com/');
    
    // Start login process
    await page.locator('.MuiButtonBase-root').first().click();
    await page.getByRole('button', { name: 'Log In' }).click();
    
    // Click the Telegram login button and handle popup
    await page.locator('#telegram-login-local_ecash_dev_bot').contentFrame()
      .getByRole('button', { name: 'Log in with Telegram' }).click();

    const page1Promise = page.waitForEvent('popup');
    const page1 = await page1Promise;
    
    // Enter phone number in Telegram login popup
    await page1.locator('#login-phone').click();
    await page1.locator('#login-phone').fill(phoneNumber);
    await page1.locator('#login-phone').press('Enter');

    // Handle wallet import
    await page.getByRole('button', { name: 'Import' }).click();
    await page.getByRole('textbox', { name: 'Enter your recovery phrase (' }).click();
    await page.getByRole('textbox', { name: 'Enter your recovery phrase (' })
      .fill(recoveryPhrase);
    await page.getByRole('button', { name: 'Import' }).click();

    // Wait for login and wallet import to complete
    console.log('Waiting for successful login and wallet import...');
    await page.waitForLoadState('networkidle');

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
    const authPath = path.join(process.cwd(), 'auth.json');
    const indexedDBPath = path.join(process.cwd(), 'indexeddb-data.json');
    
    console.log('Saving authentication state and IndexedDB data...');
    
    try {
      // Save auth state
      await context.storageState({ path: authPath });
      
      // Save IndexedDB data
      fs.writeFileSync(indexedDBPath, JSON.stringify(indexedDBData, null, 2));
      
      // Verify files were created
      if (fs.existsSync(authPath) && fs.existsSync(indexedDBPath)) {
        console.log('Auth state successfully saved to:', authPath);
        console.log('IndexedDB data successfully saved to:', indexedDBPath);
        console.log('Auth file size:', fs.statSync(authPath).size, 'bytes');
        console.log('IndexedDB file size:', fs.statSync(indexedDBPath).size, 'bytes');
      } else {
        throw new Error('One or more state files were not created');
      }
    } catch (error) {
      console.error('Failed to save state:', error);
      throw error;
    } finally {
      await context.close();
    }
  });
});


