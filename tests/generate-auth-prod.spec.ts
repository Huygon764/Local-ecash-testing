import { test } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// Load seeds data
const seedsPath = path.join(process.cwd(), 'data', 'seeds.json');
let recoveryPhrase: string;
let phoneNumber: string;

try {
  const seedsData = JSON.parse(fs.readFileSync(seedsPath, 'utf8'));
  // Use the production wallet for this test
  recoveryPhrase = seedsData.prodWallet?.recoveryPhrase;
  phoneNumber = seedsData.prodWallet?.phoneNumber;
  
  if (!recoveryPhrase || !phoneNumber) {
    throw new Error('Production wallet credentials not found in seeds.json');
  }
} catch (error) {
  console.error('Error loading production credentials from seeds.json.');
  throw error;
}

// Increase timeout for this test to allow manual login
test.setTimeout(180000); // 3 minutes

// Skip by default, only run when explicitly tagged with @prod-auth
test.describe('@prod-auth', () => {
  test.skip('Generate auth state for LocaleCash Production', async ({ browser }) => {
    // Create new browser context
    const context = await browser.newContext();
    const page = await context.newPage();
    
    await page.goto('https://localecash.com/');
      // Start login process
    await page.locator('.MuiButtonBase-root').first().click();
    await page.getByRole('button', { name: 'Log In' }).click();
      // Click the Telegram login button and handle popup
    console.log('Waiting for Telegram login button to be visible...');
    await page.waitForSelector('#telegram-login-LocaleCashBot');

        // Click the Telegram login button and handle popup
    await page.locator('#telegram-login-LocaleCashBot').contentFrame()
      .getByRole('button', { name: 'Log in with Telegram' }).click();

    console.log('Waiting for Telegram popup...');
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
            const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
              const keysRequest = store.getAllKeys();
              keysRequest.onsuccess = () => resolve(keysRequest.result);
              keysRequest.onerror = () => reject(keysRequest.error);
            });

            for (const key of keys) {
              if (typeof key === 'string') {
                const value = await new Promise((resolve, reject) => {
                  const request = store.get(key);
                  request.onsuccess = () => resolve(request.result);
                  request.onerror = () => reject(request.error);
                });
                data[key] = value;
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
    
    // Save auth state and IndexedDB data with production-specific filenames
    const authPath = path.join(process.cwd(), 'auth-prod.json');
    const indexedDBPath = path.join(process.cwd(), 'indexeddb-data-prod.json');
    
    console.log('Saving production authentication state and IndexedDB data...');
    
    try {
      await context.storageState({ path: authPath });
      fs.writeFileSync(indexedDBPath, JSON.stringify(indexedDBData, null, 2));
      
      if (fs.existsSync(authPath) && fs.existsSync(indexedDBPath)) {
        console.log('Production auth state successfully saved to:', authPath);
        console.log('Production IndexedDB data successfully saved to:', indexedDBPath);
      } else {
        throw new Error('One or more production state files were not created');
      }
    } catch (error) {
      console.error('Failed to save production state:', error);
      throw error;
    } finally {
      await context.close();
    }
  });
});
