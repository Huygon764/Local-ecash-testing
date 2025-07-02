import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import { delay, setupContext } from '../../../utils';
import { createOrder } from '../../../utils/orderUtils';
import { orderDetailText, buttonTexts, statusTexts, messageTexts } from '../../../constants';

// Load environment variables
dotenv.config();
test.setTimeout(180000); // 3 minutes

test.describe.serial('Return flow', () => {
  test('Buyer cancels order - Cancel button flow', async ({ browser }) => {
    // Create order using the shared function
    const { orderId, buyerContext, localLink } = await createOrder(browser);
    const { context, page } = buyerContext;

    console.log('Buyer is on order detail page, clicking Cancel button...');

    // Wait for Cancel button to be visible
    const cancelButton = page.locator(`button:has-text("${buttonTexts.cancel}")`);
    await expect(cancelButton).toBeVisible();

    // Click Cancel button
    await cancelButton.click();

    // Wait for page to update and verify order status changed to Cancelled
    console.log('Waiting for order status to change to Cancelled...');
    await expect(page.locator(`text=/Status:.*${statusTexts.cancelled}/i`)).toBeVisible({ timeout: 15000 });

    // Verify the "Order has been cancelled" message appears
    await expect(page.locator(`text=/${messageTexts.orderCancelled}/i`)).toBeVisible();

    console.log('Buyer cancel flow completed successfully!');

    // Clean up
    await context.close();
  });

  test('Seller declines order - Decline button flow', async ({ browser }) => {
    // Create order using the shared function
    const { orderId, buyerContext, localLink } = await createOrder(browser);
    const { context: buyerContext_context, page: buyerPage } = buyerContext;

    // Setup seller context and navigate to the order
    const sellerContext = await setupContext(browser, 'Seller');
    console.log(`Seller navigating to order: ${localLink}/order-detail?id=${orderId}`);
    await sellerContext.page.goto(`${localLink}/order-detail?id=${orderId}`);
    await sellerContext.page.waitForLoadState('networkidle');

    // Wait for seller's order detail view to load
    await sellerContext.page.waitForSelector(`text=/${orderDetailText}/i`);

    // Verify seller action buttons are present
    console.log('Verifying seller can see Decline and Escrow buttons...');
    await expect(sellerContext.page.locator(`button:has-text("${buttonTexts.decline}")`)).toBeVisible();
    await expect(sellerContext.page.locator(`button:has-text("${buttonTexts.escrow}")`)).toBeVisible();

    // Verify order status is Pending
    await expect(sellerContext.page.locator(`text=/Status:.*${statusTexts.pending}/i`)).toBeVisible();

    // Click Decline button
    console.log('Seller clicking Decline button...');
    const declineButton = sellerContext.page.locator(`button:has-text("${buttonTexts.decline}")`);
    await declineButton.click();

    // Wait for seller's page to update and verify order status changed to Cancelled
    console.log('Waiting for seller page to update to Cancelled status...');
    await expect(sellerContext.page.locator(`text=/Status:.*${statusTexts.cancelled}/i`)).toBeVisible({ timeout: 15000 });

    // Verify the "Order has been cancelled" message appears on seller's page
    await expect(sellerContext.page.locator(`text=/${messageTexts.orderCancelled}/i`)).toBeVisible();

    console.log('Seller decline flow completed successfully!');

    // Clean up
    await buyerContext_context.close();
    await sellerContext.context.close();
  });

  test('Full escrow cancel flow', async ({ browser }) => {
    // Create order using the shared function
    const { orderId, buyerContext, localLink } = await createOrder(browser);
    const { context: buyerContext_context, page: buyerPage } = buyerContext;

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

    // Verify seller sees completed status and claim options
    await expect(sellerContext.page.locator(`text=/Status:.*${statusTexts.returned}/i`)).toBeVisible({ timeout: 15000 });

    // Verify both radio button options are present
    const claimBackRadio = sellerContext.page.locator('input[type="radio"]').first();
    const donateRadio = sellerContext.page.locator('input[type="radio"]').last();
    await expect(claimBackRadio).toBeVisible();
    await expect(donateRadio).toBeVisible();

    // Select the claim back option (first radio button)
    console.log('Seller selecting claim back option...');
    await claimBackRadio.click();

    // Verify claim back option is selected
    await expect(claimBackRadio).toBeChecked();

    // Click the claim back fee button
    const claimBackButton = sellerContext.page.locator(`button:has-text("${buttonTexts.claim}")`);
    await expect(claimBackButton).toBeVisible();
    await claimBackButton.click();

    console.log('Return full flow completed successfully!');

    // Clean up
    await buyerContext_context.close();
    await sellerContext.context.close();
  });
});
