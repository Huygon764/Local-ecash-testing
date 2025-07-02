import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { BrowserContext, Page } from '@playwright/test';

// Load environment variables
dotenv.config();

export async function setupContext(
  browser: any, 
  walletRole: 'Seller' | 'Buyer' | 'Arb'
): Promise<{ context: BrowserContext; page: Page }> {
  // Determine the correct auth data folder based on role
  const authDataFolder = path.join(process.cwd(), 'data-auth', 'local');
  
  // Map role to file names
  const roleFileMap = {
    'Seller': 'seller',
    'Buyer': 'buyer',
    'Arb': 'arb' 
  };
  
  const filePrefix = roleFileMap[walletRole];
  const authPath = path.join(authDataFolder, `${filePrefix}-auth.json`);
  const indexedDBPath = path.join(authDataFolder, `${filePrefix}-indexeddb-data.json`);
  
  // Check if files exist
  if (!fs.existsSync(authPath)) {
    throw new Error(`Auth state file not found for ${walletRole}: ${authPath}. Run generate-auth test first.`);
  }
  
  if (!fs.existsSync(indexedDBPath)) {
    throw new Error(`IndexedDB data file not found for ${walletRole}: ${indexedDBPath}. Run generate-auth test first.`);
  }

  console.log(`Loading auth state for ${walletRole} from:`, authPath);
  console.log(`Loading IndexedDB data for ${walletRole} from:`, indexedDBPath);

  // Create context with auth state
  const context = await browser.newContext({
    storageState: authPath
  });

  const page = await context.newPage();
  
  // Navigate to a temporary route on the actual domain to initialize IndexedDB
  const localLink = process.env.LOCAL_LINK || 'https://escrow.test';
  await page.goto(`${localLink}/init`);
  
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
        request.onblocked = () => {
          console.log('Database deletion blocked');
          resolve(false);
        };
      });
    });

    // Wait a bit after deletion
    await page.waitForTimeout(500);

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
    console.log(`IndexedDB state after setup for ${walletRole}:`, dbState);

  } catch (error) {
    console.error(`Failed to set up IndexedDB for ${walletRole}:`, error);
    throw error;
  }
  
  return { context, page };
}

export function delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
}
