import { expect } from '@playwright/test';
import { delay, setupContext } from './index';
import { timeToLoadUtxos, securityDepositOptions } from '../constants';

// Helper function to handle security deposit dialog - Click "No, thanks"
async function handleSecurityDepositDecline(page: any) {
  console.log('Checking for security deposit dialog...');
  
  try {
    // Wait for the security deposit dialog to appear with shorter timeout
    await page.waitForSelector('text=/Confirm Security Deposit/i', { timeout: 5000 });
    console.log('Security deposit dialog appeared - clicking "No, thanks"');
    
    // Click "No, thanks" button
    const noThanksButton = page.locator('button:has-text("No, thanks")');
    await expect(noThanksButton).toBeVisible();
    await noThanksButton.click();
    
    console.log('Clicked "No, thanks" - security deposit declined');
  } catch (error) {
    console.log('Security deposit dialog did not appear - proceeding without action');
  }
}

// Helper function to handle security deposit dialog - Click deposit button
async function handleSecurityDepositAccept(page: any) {
  console.log('Checking for security deposit dialog...');
  
  try {
    // Wait for the security deposit dialog to appear with shorter timeout
    await page.waitForSelector('text=/Confirm Security Deposit/i', { timeout: 5000 });
    console.log('Security deposit dialog appeared - looking for deposit button');
    
    // Find and click the deposit button (dynamic amount)
    const depositButton = page.locator('button:has-text("Deposit")').first();
    await expect(depositButton).toBeVisible();
    
    // Get the button text to log the amount
    const buttonText = await depositButton.textContent();
    console.log(`Clicking deposit button: ${buttonText}`);
    
    await depositButton.click();
    console.log('Security deposit accepted');
  } catch (error) {
    console.log('Security deposit dialog did not appear - proceeding without action');
  }
}

// Helper function to create an order with "No, thanks" option
export async function createOrder(browser: any) {
  return await createOrderBase(browser, securityDepositOptions.decline);
}

// Helper function to create an order with deposit option
export async function createOrderWithDeposit(browser: any) {
  return await createOrderBase(browser, securityDepositOptions.accept);
}

// Base function for creating orders
async function createOrderBase(browser: any, depositOption: 'decline' | 'accept') {
  // Setup test context for Buyer
  const { context, page } = await setupContext(browser, 'Buyer');

  const localLink = process.env.LOCAL_LINK || 'https://escrow.test';
  const offerId = 'cmb60r9x6000986pxaipl73ez';

  // Step 1: Navigate to the offer page
  console.log(`Navigating to offer: ${localLink}/?offerId=${offerId}`);
  await page.goto(`${localLink}/?offerId=${offerId}`);
  await page.waitForLoadState('networkidle');

  // Step 2: Fill in the order form
  console.log('Filling order form...');

  // Wait for amount input to be visible and fill it
  const amountInput = page.locator('#amount-place-order');
  await amountInput.fill('6');

  // Fill in the message
  const messageInput = page.locator('#message');
  await messageInput.fill('hello');

  // Verify the amount is entered correctly
  await expect(amountInput).toHaveValue('6');
  await expect(messageInput).toHaveValue('hello');

  // Step 3: Click Create button
  await delay(timeToLoadUtxos); // wait to load utxo
  console.log('Clicking Create button...');
  const createButton = page.locator('button:has-text("Create")');
  await createButton.click();

  // Step 4: Handle Security Deposit dialog based on option
  if (depositOption === securityDepositOptions.decline) {
    await handleSecurityDepositDecline(page);
  } else {
    await handleSecurityDepositAccept(page);
  }

  // Step 5: Wait for redirect to order detail page
  console.log('Waiting for redirect to order detail page...');

  // Wait for navigation to order detail page
  await page.waitForURL(/.*\/order-detail\?id=.*/, { timeout: 15000 });

  // Extract the generated order ID from URL
  const currentUrl = page.url();
  const urlParams = new URL(currentUrl).searchParams;
  const orderId = urlParams.get('id');
  
  if (!orderId) {
    throw new Error('Order ID not found in URL');
  }
  
  console.log(`Order created with ID: ${orderId}`);

  return {
    orderId,
    buyerContext: { context, page },
    localLink
  };
}
