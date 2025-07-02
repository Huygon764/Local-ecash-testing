import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import { delay, setupContext } from '../../../utils';
import { createOrderWithDeposit } from '../../../utils/orderUtils';
import { orderDetailText, buttonTexts, statusTexts, messageTexts } from '../../../constants';

// Load environment variables
dotenv.config();
test.setTimeout(180000); // 3 minutes

test.describe.serial('Return flow with buyer deposit', () => {
  test('Full escrow cancel flow with buyer deposit - Random selections', async ({ browser }) => {
    console.log('=== Starting Full Escrow Cancel Flow with Buyer Deposit ===');

    // Create order with buyer deposit using the shared function
    const { orderId, buyerContext, localLink } = await createOrderWithDeposit(browser);
    const { context: buyerContext_context, page: buyerPage } = buyerContext;

    console.log(`Order created with buyer deposit. Order ID: ${orderId}`);

    // Setup seller context and navigate to the order
    const sellerContext = await setupContext(browser, 'Seller');
    console.log(`Seller navigating to order: ${localLink}/order-detail?id=${orderId}`);
    await sellerContext.page.goto(`${localLink}/order-detail?id=${orderId}`);
    await sellerContext.page.waitForLoadState('networkidle');
    await delay(15000); // wait to load utxo

    // Wait for seller's order detail view to load
    await sellerContext.page.waitForSelector(`text=/${orderDetailText}/i`);

    // Verify seller action buttons are present and click Escrow
    console.log('Seller clicking Escrow button...');
    await expect(sellerContext.page.locator(`button:has-text("${buttonTexts.escrow}")`)).toBeVisible();
    await sellerContext.page.locator(`button:has-text("${buttonTexts.escrow}")`).click();

    // Wait for escrow to complete on seller's side
    console.log('Waiting for escrow to complete...');
    await expect(sellerContext.page.locator(`text=/Status:.*${statusTexts.escrowed}/i`)).toBeVisible({ timeout: 15000 });
    await expect(sellerContext.page.locator(`text=/${messageTexts.escrowSuccess}/i`)).toBeVisible();

    // Verify buyer sees escrowed status and Cancel button
    await expect(buyerPage.locator(`text=/Status:.*${statusTexts.escrowed}/i`)).toBeVisible({ timeout: 15000 });
    const cancelButton = buyerPage.locator(`button:has-text("${buttonTexts.cancel}")`);
    await expect(cancelButton).toBeVisible();

    // Buyer clicks Cancel
    console.log('Buyer clicking Cancel button after escrow...');
    await cancelButton.click();

    // Wait for confirmation modal to appear
    console.log('Waiting for confirmation modal...');
    await expect(buyerPage.locator(`text=/${messageTexts.confirmationModal}/i`)).toBeVisible({ timeout: 5000 });
    await expect(buyerPage.locator(`text=/${messageTexts.cancelConfirmation}/i`)).toBeVisible();

    // Click Cancel button in the modal to confirm
    console.log('Clicking Cancel button in confirmation modal...');
    const modalCancelButton = buyerPage.locator(`button:has-text("${buttonTexts.cancel}")`).last(); // Use .last() to get the modal button
    await expect(modalCancelButton).toBeVisible();
    await modalCancelButton.click();

    // Wait for cancellation to complete and status to change
    console.log('Waiting for order to be cancelled...');
    await expect(buyerPage.locator(`text=/Status:.*${statusTexts.cancelled}/i`)).toBeVisible({ timeout: 15000 });

    // Verify seller sees returned status and claim options
    await expect(sellerContext.page.locator(`text=/Status:.*${statusTexts.returned}/i`)).toBeVisible({ timeout: 15000 });

    // Step: Seller makes random choice between radio button options
    console.log('Seller making random choice for security deposit claim...');

    // Get all seller radio button options
    const sellerRadioButtons = sellerContext.page.locator('input[type="radio"]');
    const sellerRadioCount = await sellerRadioButtons.count();
    
    console.log(`Seller has ${sellerRadioCount} radio button options available`);
    
    // Randomly select one of the seller options
    const sellerRandomIndex = Math.floor(Math.random() * sellerRadioCount);
    console.log(`Seller randomly selecting option ${sellerRandomIndex + 1} out of ${sellerRadioCount}`);
    
    // Get the label text for the selected option
    const sellerSelectedLabel = await sellerContext.page.locator('label').nth(sellerRandomIndex).textContent();
    console.log(`Seller selected option: ${sellerSelectedLabel}`);
    
    await sellerRadioButtons.nth(sellerRandomIndex).click();
    await expect(sellerRadioButtons.nth(sellerRandomIndex)).toBeChecked();

    // Click the claim button
    const claimBackButton = sellerContext.page.locator(`button:has-text("${buttonTexts.claim}")`);
    await expect(claimBackButton).toBeVisible();
    console.log('Seller clicking CLAIM button...');
    await claimBackButton.click();

    // Wait for seller claim to complete and buyer to receive socket update
    console.log('Waiting for buyer to receive socket update about seller claim...');
    
    // Buyer should see the security deposit options screen (similar to image-1)
    await delay(1000); // Wait for socket update
    
    // Buyer should automatically receive the radio button options for security deposit
    await buyerPage.waitForSelector('input[type="radio"]', { timeout: 10000 });
    
    // Step: Buyer makes random choice between radio button options
    console.log('Buyer making random choice for security deposit...');
    
    const buyerRadioButtons = buyerPage.locator('input[type="radio"]');
    const buyerRadioCount = await buyerRadioButtons.count();
    
    console.log(`Buyer has ${buyerRadioCount} radio button options available`);
    
    // Randomly select one of the buyer options
    const buyerRandomIndex = Math.floor(Math.random() * buyerRadioCount);
    console.log(`Buyer randomly selecting option ${buyerRandomIndex + 1} out of ${buyerRadioCount}`);
    
    // Get the label text for the selected option
    const buyerSelectedLabel = await buyerPage.locator('label').nth(buyerRandomIndex).textContent();
    console.log(`Buyer selected option: ${buyerSelectedLabel}`);
    
    await buyerRadioButtons.nth(buyerRandomIndex).click();
    await expect(buyerRadioButtons.nth(buyerRandomIndex)).toBeChecked();
    
    // Click buyer's claim button
    console.log('Buyer clicking CLAIM button...');
    const buyerClaimButton = buyerPage.locator(`button:has-text("${buttonTexts.claim}")`);
    await expect(buyerClaimButton).toBeVisible();
    await buyerClaimButton.click();
    
    // Wait for final completion
    console.log('Waiting for final order completion...');
    await expect(buyerPage.locator(`text=/${messageTexts.orderCancelled}/i`)).toBeVisible({ timeout: 15000 });
    
    console.log('Return flow with buyer deposit and random selections completed successfully!');

    // Clean up
    await buyerContext_context.close();
    await sellerContext.context.close();
    
    console.log('=== Full Escrow Cancel Flow with Buyer Deposit Test Completed ===');
  });
});