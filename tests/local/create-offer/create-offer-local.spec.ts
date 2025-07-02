import { test, expect, BrowserContext, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

async function setupTestContext(browser: any): Promise<{ context: BrowserContext; page: Page }> {
  // Load auth state
  const authDataFolder = path.join(process.cwd(), 'data-auth');
  const authPath = path.join(authDataFolder, 'auth.json');
  const indexedDBPath = path.join(authDataFolder, 'indexeddb-data.json');
  
  if (!fs.existsSync(authPath) || !fs.existsSync(indexedDBPath)) {
    throw new Error('Auth state or IndexedDB data files not found. Run generate-auth test first.');
  }

  // Create context with auth state
  const context = await browser.newContext({
    storageState: authPath
  });

  const page = await context.newPage();
  
  // Navigate to a temporary route on the actual domain to initialize IndexedDB
  await page.goto(`${process.env.LOCAL_LINK}/init`);
  
  // Initialize IndexedDB with our data
  const indexedDBData = JSON.parse(fs.readFileSync(indexedDBPath, 'utf-8'));
  try {
    // Wait a bit to ensure the page is ready
    await page.waitForTimeout(1000);

    // Clear any existing data first
    await page.evaluate(() => {
      return new Promise((resolve) => {
        const request = indexedDB.deleteDatabase('escrow-indexeddb');
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      });
    });

    // Now restore our data
    await page.evaluate(async (data) => {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('escrow-indexeddb', 1);
        
        request.onupgradeneeded = (event) => {
          console.log('Creating object store');
          const db = request.result;
          if (!db.objectStoreNames.contains('keyvaluepairs')) {
            db.createObjectStore('keyvaluepairs');
          }
        };

        request.onerror = (event) => {
          console.error('IndexedDB error:', event);
          reject(request.error);
        };

        request.onsuccess = async () => {
          const db = request.result;
          try {
            const transaction = db.transaction('keyvaluepairs', 'readwrite');
            const store = transaction.objectStore('keyvaluepairs');

            // Store each key-value pair
            for (const [key, value] of Object.entries(data)) {
              console.log(`Storing key: ${key}`);
              await store.put(value, key);
            }

            transaction.oncomplete = () => {
              db.close();
              console.log('Successfully restored IndexedDB data');
              resolve(true);
            };

            transaction.onerror = (event) => {
              console.error('Transaction error:', event);
              reject(transaction.error);
            };
          } catch (error) {
            console.error('Error in IndexedDB transaction:', error);
            reject(error);
          }
        };
      });
    }, indexedDBData);

    // Now navigate to the actual page
    await page.goto(url);
    await page.waitForLoadState('networkidle');

    // Quick verification that data was stored
    const dbState = await page.evaluate(async () => {
      return new Promise((resolve) => {
        const request = indexedDB.open('escrow-indexeddb');
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('keyvaluepairs', 'readonly');
          const store = transaction.objectStore('keyvaluepairs');
          const countRequest = store.count();
          countRequest.onsuccess = () => {
            db.close();
            resolve({ count: countRequest.result });
          };
        };
      });
    });
    console.log('IndexedDB state after setup:', dbState);

  } catch (error) {
    console.error('Failed to set up IndexedDB:', error);
    throw error;
  }
  
  return { context, page };
}

// Existing tests using the new setup function
test('Create offer', async ({ browser }) => {
  test.setTimeout(60000); // Increase timeout to 2 minutes
  const { context, page } = await setupTestContext(browser);  try {
    // Click on My Offers tab (using the LocalOfferOutlinedIcon button)
    await page.getByTestId('LocalOfferOutlinedIcon').click();

      await page.goto(url);
      await page.waitForTimeout(2000); // Wait for 2 seconds
      await page.locator('div').filter({ hasText: /^My offers$/ }).getByRole('button').click();
      
      await page.getByRole('button', { name: 'Create' }).click();
    
      const paymentMethods = ['Bank transfer', 'Cash in person', 'Payment app', 'Crypto', 'Goods/Services'];
      let randomMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
    //  randomMethod = 'Crypto'; // For testing purpose, we will use 'Cash in person' method

      let randomClicks = Math.floor(Math.random() * 6); // Random number between 0 and 5
    
      await page.waitForTimeout(1000); // Wait for 1 second
      
      await page.getByLabel(randomMethod).check();
    
      switch (randomMethod) {
        case 'Crypto':
          const coins = ['BTC:1', 'BCH:100', 'ETH:100', 'XPI:1000000', 'DOGE:100', 'XRP:100', 'LTC:100'];
          const randomCoin = coins[Math.floor(Math.random() * coins.length)];
          await page.getByLabel('Crypto').check();
    
          await page.locator('#select-coin').selectOption(randomCoin);
    
          // Click the Next button
          await page.getByRole('button', { name: 'Next' }).click();
    
          const [coin, denomination] = randomCoin.split(':');
          const minValue = (parseFloat(denomination) * 1).toString();
          const maxValue = (parseFloat(denomination) * 10).toString();
    
          await page.locator('input#min').click();
          await page.locator('input#min').fill(minValue);
          await page.locator('input#max').click();
          await page.locator('input#max').fill(maxValue);
    
          break;
        case 'Goods/Services':
          // Nothing in the screen, just click the Next button
          await page.waitForTimeout(1000); // Wait for 1 second
          await page.getByRole('button', { name: 'Next' }).click();
    
          await page.locator('input#min').click();
          await page.locator('input#min').fill('100');
          await page.locator('input#max').click();
          await page.locator('input#max').fill('1000');
    
          break;

        case 'Cash in person':
            // Add any specific actions for 'Cash in person' if needed
    //        const countryOptions = await page.getByLabel('Country').locator('option').allTextContents();
    //        const randomCountry = countryOptions[Math.floor(Math.random() * countryOptions.length)];
    //        await page.getByLabel('Country').selectOption(randomCountry);
    
            await page.getByLabel('Currency').selectOption('VND:1000000');

            await page.getByLabel('Country').click();
            await page.getByRole('button', { name: 'Vietnam' }).click();
            await page.getByLabel('State').click();
    //        await page.getByLabel('Search').fill('quan');
            await page.getByRole('button', { name: 'Quang Nam' }).click();
            await page.getByLabel('City').click();
            await page.getByLabel('Search').fill('hoi');
            await page.getByRole('button', { name: 'Hoi An' }).click();
    
    //      await page.waitForTimeout(1000); // Wait for the state options to load
    
    //        const stateOptions = await page.getByLabel('State').locator('option').allTextContents();
    //        const randomState = stateOptions[Math.floor(Math.random() * stateOptions.length)];
    //        await page.getByLabel('State').selectOption(randomState);
            await page.getByRole('button', { name: 'Next' }).click();
     
            for (let i = 0; i < 3; i++) {
              await page.getByRole('button', { name: '+' }).click();
            }
            await page.locator('input#min').click();
            await page.locator('input#min').fill('100');
            await page.locator('input[name="max"]').click();
            await page.locator('input[name="max"]').fill('1000');
    
            break;
        case 'Payment app':
          await page.getByLabel('Currency').selectOption('VND:1000000');
        
          const paymentApps = [
            'Abra', 'AdvCash', 'Afriex', 'Airline Tickets', 'AirPay', 'AirTM', 'Alipay', 'AppleCash', 'ApplePay',
            'AstroPay Direct', 'Azimo', 'Banco Brubank', 'BanescoPagoMóvil', 'Barter from Flutterwave', 'Bhim',
            'Bill payment', 'Bitjem Gift Card', 'BitLipa', 'Bitsika', 'Bitwallet', 'Bizum', 'Bkash E-Wallet ',
            'BNB CashApp', 'Bnext', 'Bunq Transfer', 'Capital One 360 P2P Payment', 'Carbon', 'Cash app',
            'CashApp Payment', 'CashU', 'Cellulant', 'Chime instant transfers', 'Chipper Cash', 'CIB smart wallet',
            'Circle Pay', 'Current Pay', 'Dash App', 'Digital eRupee', 'Ding Connect', 'ePay', 'Esewa', 'Etisalat cash',
            'eZcash', 'Facebook Messenger Payment', 'Flashpay Netspend', 'FNB E-WALLET', 'Freecharge', 'Frimi',
            'Gobank Money Transfer', 'Google Pay', 'GönderAL', 'iCard', 'Ininal', 'Interac e-Transfer', 'iudu',
            'Jawwal Pay', 'JioMoney', 'KoronaPay', 'Lemon', 'Lemonade Finance', 'LiqPay', 'mCash Mobile Payment',
            'Mercado Pago', 'MobiKwik Wallet', 'Mobile Recharge', 'MobilePay', 'MODO', 'Momo', 'N26', 'NaranjaX',
            'NayaPay', 'NBE Phone cash', 'Neteller', 'OkPay', 'Other Online Wallets', 'Pago Fácil', 'Papara', 'Payeer',
            'Payoneer', 'PayPal', 'Paypower', 'Paysend.com', 'Paysera Money Transfer', 'PaySon', 'Paytm Online Wallet',
            'Perfect Money', 'Personal Pay', 'Pesalink', 'PhonePe', 'PIM', 'PlusGirot', 'Powwi', 'Przelewy24', 'Pyypl',
            'Qiwi', 'QQ Pay', 'Quickteller', 'Rapid Transfer', 'Rapipago', 'Remitly', 'Revolut', 'Rocket Remit',
            'Sendwave Wallet', 'Simple Bank App', 'Skrill', 'SoFi Money Instant Transfer', 'Sofort', 'Stripe', 'Swish',
            'Tap', 'Tarjeta PAGO24', 'Tarjeta PREX', 'Tarjeta UALA', 'Tele2', 'Tigo Money', 'Tpaga', 'TransferGo',
            'TrueMoney', 'Upaisa', 'Venmo', 'VIABUY Card2Card Transfer', 'Viettel Money', 'Volet.com (Formerly Advcash)',
            'Wari', 'Wave Mobile Wallet', 'WebMoney', 'WeChat Pay', 'Wise (TransferWise)', 'Xoom Money Transfer', 'YONO',
            'Yoomee Mobile Money', 'Yoomoney', 'ZaloPay', 'Zelle', 'Zelle Pay', 'Zinli'
          ];
          const randomPaymentApp = paymentApps[Math.floor(Math.random() * paymentApps.length)];
          await page.locator('#select-paymentApp').selectOption(randomPaymentApp);
        case 'Bank transfer':
          await page.getByLabel('Currency').selectOption('VND:1000000');
          await page.getByRole('button', { name: 'Next' }).click();
          
          let randomClicks = Math.floor(Math.random() * 6); // Random number between 0 and 5
          for (let i = 0; i < randomClicks; i++) {
            await page.getByRole('button', { name: '+' }).click();
          }
          
          await page.locator('input#min').click();
          await page.locator('input#min').fill('100');
          await page.locator('input[name="max"]').click();
          await page.locator('input[name="max"]').fill('1000');
          break;
      }
    
      // Fill offer headline in the format Local eCash Offer YYMMĐHHMMSS
      const now = new Date();
      const formattedTime = now.toISOString().replace(/[-T:]/g, '').slice(0, 14);
      const offerHeadline = `Local eCash Offer ${formattedTime}`;
      
      await page.getByLabel('Headline').click();
      await page.getByLabel('Headline').fill(offerHeadline);
      await page.getByRole('button', { name: 'Preview' }).click();
    
      const listingOptions = ['Unlisted', 'Listed'];
      const randomListing = listingOptions[Math.floor(Math.random() * listingOptions.length)];
      if (randomListing === 'Listed') {
        await page.locator('input[value="false"]').check();
      } else {
        await page.locator('input[value="true"]').check();
      }

      await page.getByRole('button', { name: 'Create offer' }).click();
    
      await expect(page.getByRole('alert')).toContainText('Offer created successfully!');
    
      //await page.waitForTimeout(3000); // Wait for 3 seconds
      await expect(page.getByText(`Headline: ${offerHeadline}`)).toBeVisible();
    
  } catch (error) {
    console.error('Test failed:', error);
    throw error;
  } finally {
    await context.close();
  }
});
