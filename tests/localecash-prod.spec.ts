import { test, expect, BrowserContext, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// Handle dynamic import for node-fetch
let fetch: any;
const initFetch = async () => {
  const module = await import('node-fetch');
  fetch = module.default;
};

// Telegram config
const TELEGRAM_CONFIG = {
  GROUP_ID: "-1001407755699",
  CHANNEL_ID: "-1001465656661",
  BOT_TOKEN: ""
};

async function sendTelegramMessage(message: string) {
  try {
    // Ensure fetch is initialized
    if (!fetch) {
      await initFetch();
    }
    
    const url = `https://api.telegram.org/bot${TELEGRAM_CONFIG.BOT_TOKEN}/sendMessage`;
    const body = {
      chat_id: TELEGRAM_CONFIG.CHANNEL_ID,
      text: message,
      parse_mode: 'HTML'
    };
/*
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      console.error('Failed to send Telegram message:', await response.text());
    }
*/    
  } catch (error) {
    console.error('Error sending Telegram message:', error);
  }
}

// Production test should be tagged with @prod to be run separately
test.describe('@prod', () => {  // Add error handling
  test.afterEach(async ({ }, testInfo) => {
    if (testInfo.status !== 'passed') {
      const error = testInfo.error?.stack || testInfo.error?.message || 'Unknown error';
      // Escape special characters and clean up the error message for Telegram
      const cleanError = error
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/&/g, '&amp;')
        .replace(/element\(s\) not found/g, 'element not found');
      const message = `❌ Test failed: ${testInfo.title}\n\nError:\n<pre>${cleanError}</pre>`;
      await sendTelegramMessage(message);
    }
  });

  // Reuse the same setupTestContext function but for production environment
  async function setupTestContext(browser: any): Promise<{ context: BrowserContext; page: Page }> {
    // Load auth state - we'll use different auth files for production
    const authPath = path.join(process.cwd(), 'auth-prod.json');
    const indexedDBPath = path.join(process.cwd(), 'indexeddb-data-prod.json');
    
    if (!fs.existsSync(authPath) || !fs.existsSync(indexedDBPath)) {
      throw new Error('Production auth state or IndexedDB data files not found. Run generate-auth test for production first.');
    }

    // Create context with auth state
    const context = await browser.newContext({
      storageState: authPath
    });

    const page = await context.newPage();
    
    // Navigate to production site
    await page.goto('https://localecash.com/init');
    
    // Initialize IndexedDB with production data
    const indexedDBData = JSON.parse(fs.readFileSync(indexedDBPath, 'utf-8'));
    try {
      await page.waitForTimeout(1000);
      
      // Rest of the IndexedDB setup code remains the same
      await page.evaluate(() => {
        return new Promise((resolve) => {
          const request = indexedDB.deleteDatabase('escrow-indexeddb');
          request.onsuccess = () => resolve(true);
          request.onerror = () => resolve(false);
        });
      });

      await page.evaluate(async (data) => {
        return new Promise((resolve, reject) => {
          const request = indexedDB.open('escrow-indexeddb', 1);
          
          request.onupgradeneeded = (event) => {
            const db = request.result;
            if (!db.objectStoreNames.contains('keyvaluepairs')) {
              db.createObjectStore('keyvaluepairs');
            }
          };

          request.onsuccess = async () => {
            const db = request.result;
            try {
              const transaction = db.transaction('keyvaluepairs', 'readwrite');
              const store = transaction.objectStore('keyvaluepairs');

              for (const [key, value] of Object.entries(data)) {
                await store.put(value, key);
              }

              transaction.oncomplete = () => {
                db.close();
                resolve(true);
              };
            } catch (error) {
              reject(error);
            }
          };
        });
      }, indexedDBData);

      await page.goto('https://localecash.com');
      await page.waitForLoadState('networkidle');

    } catch (error) {
      console.error('Failed to set up IndexedDB:', error);
      throw error;
    }
    
    return { context, page };
  }

  test('Create and cancel VND order on production', async ({ browser }) => {
    // Increase timeout for production test
    test.setTimeout(30000); 
    
    const { context, page } = await setupTestContext(browser);
    try {
      // Go to production offer page - replace with your actual offer ID
      await page.goto('https://localecash.com/offer-detail?id=cm42oitez000bjmvxlpphzaem');

      await page.getByRole('button', { name: 'Buy' }).click();
      await page.waitForTimeout(1000);

      // Handle amount input with VND range 100,000 to 10,000,000
      await page.locator('input[name="amount"]').click();
      const minAmount = 10000;
      const maxAmount = 10000000;
      const randomAmount = Math.floor(Math.random() * (maxAmount - minAmount) + minAmount);
      // Format the amount with comma separators for VND
      const formattedAmount = randomAmount;
      
      await page.locator('input[name="amount"]').fill('');
      await page.locator('input[name="amount"]').type(randomAmount.toString(), { delay: 100 });
      
      await page.locator('textarea#message').click();
      await page.locator('textarea#message').fill('I want to buy XEC via bank transfer.');      await page.getByRole('button', { name: 'Create' }).click();
        // Wait for both buttons to be available
      const noThanksButton = page.getByRole('button', { name: 'No, thanks' });
      const depositButton = page.getByRole('button', { name: /^Deposit \d+(\.\d+)? XEC$/ });
      
      // Make sure the buttons are visible before proceeding
      await Promise.all([
        noThanksButton.waitFor({ state: 'visible' })
      ]);
      
      // Randomly choose one of the buttons
      //const button = Math.random() < 0.5 ? noThanksButton : depositButton;
      await noThanksButton.click();
      
      // Wait for success message with increased timeout and visibility check
      await expect(page.locator('div.MuiAlert-filledSuccess')).toBeVisible({ timeout: 3000 });
      await expect(page.locator('div.MuiAlert-filledSuccess')).toContainText('Order created successfully!');
      await page.waitForTimeout(1000); // Increased wait time for WebKit

      // Cancel the order
      await page.getByRole('button', { name: 'Cancel' }).click();
      await expect(page.getByText('Order has been cancelled')).toBeVisible();

    } finally {
      await context.close();
    }
  });
});
