import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import { delay, setupContext } from '../../../utils';
import { createOrderWithDeposit } from '../../../utils/orderUtils';
import { orderDetailText, buttonTexts, statusTexts, messageTexts } from '../../../constants';

// Load environment variables
dotenv.config();
test.setTimeout(300000); // 5 minutes for dispute flow

// Helper function for common dispute flow setup with buyer deposit
async function executeCommonDisputeFlowWithDeposit(browser: any) {
    // Create order with buyer deposit using the shared function
    const { orderId, buyerContext, localLink } = await createOrderWithDeposit(browser);
    const { context: buyerContext_context, page: buyerPage } = buyerContext;

    // Setup seller context and navigate to the order
    const sellerContext = await setupContext(browser, 'Seller');
    console.log(`Seller navigating to order: ${localLink}/order-detail?id=${orderId}`);
    await sellerContext.page.goto(`${localLink}/order-detail?id=${orderId}`);
    await sellerContext.page.waitForLoadState('networkidle');
    await delay(15000); // wait to load utxo

    // Wait for seller's order detail view to load
    await sellerContext.page.waitForSelector(`text=/${orderDetailText}/i`);

    // Step 1: Seller clicks Escrow button
    console.log('Step 1: Seller clicking Escrow button...');
    await expect(sellerContext.page.locator(`button:has-text("${buttonTexts.escrow}")`)).toBeVisible();
    await sellerContext.page.locator(`button:has-text("${buttonTexts.escrow}")`).click();

    // Wait for escrow to complete on seller's side
    console.log('Waiting for escrow to complete...');
    await expect(sellerContext.page.locator(`text=/Status:.*${statusTexts.escrowed}/i`)).toBeVisible({ timeout: 15000 });
    await expect(sellerContext.page.locator(`text=/${messageTexts.escrowSuccess}/i`)).toBeVisible();

    // Step 2: Seller clicks Dispute button
    console.log('Step 2: Seller clicking Dispute button...');
    const disputeButton = sellerContext.page.locator(`button:has-text("${buttonTexts.dispute}")`);
    await expect(disputeButton).toBeVisible();
    await disputeButton.click();

    // Step 3: Fill dispute reason and create dispute
    console.log('Step 3: Filling dispute reason and creating dispute...');

    // Wait for dispute modal to appear - target the heading specifically
    await expect(sellerContext.page.locator('h2:has-text("Create dispute")')).toBeVisible({ timeout: 5000 });

    // Fill reason field with "create-dispute"
    const reasonField = sellerContext.page.locator('input[placeholder*="Reason"], textarea[placeholder*="Reason"], input[name*="reason"], textarea[name*="reason"]').first();
    await expect(reasonField).toBeVisible();
    await reasonField.fill('create-dispute');

    // Click CREATE DISPUTE button
    const createDisputeButton = sellerContext.page.locator(`button:has-text("${buttonTexts.createDispute}")`);
    await expect(createDisputeButton).toBeVisible();
    await createDisputeButton.click();

    // Wait for dispute to be created and status to change
    console.log('Waiting for dispute to be created...');
    await expect(sellerContext.page.locator(`text=/Status:.*${statusTexts.dispute}/i`)).toBeVisible({ timeout: 15000 });

    // Step 4: Setup arbitrator context and navigate to order
    const arbContext = await setupContext(browser, 'Arb');
    console.log(`Arbitrator navigating to order: ${localLink}/order-detail?id=${orderId}`);
    await arbContext.page.goto(`${localLink}/order-detail?id=${orderId}`);
    await arbContext.page.waitForLoadState('networkidle');

    // Wait for arbitrator's order detail view to load
    await arbContext.page.waitForSelector(`text=/${orderDetailText}/i`);

    // Verify dispute status is visible and "Please resolve the dispute" message
    await expect(arbContext.page.locator(`text=/Status:.*${statusTexts.dispute}/i`)).toBeVisible();
    await expect(arbContext.page.locator(`text=/${messageTexts.pleaseResolveDispute}/i`)).toBeVisible();

    // Step 5: Arbitrator clicks "GO TO DISPUTE" button
    console.log('Step 5: Arbitrator clicking GO TO DISPUTE button...');
    const goToDisputeButton = arbContext.page.locator(`button:has-text("${buttonTexts.goToDispute}")`);
    await expect(goToDisputeButton).toBeVisible();
    await goToDisputeButton.click();

    // Wait for navigation to dispute detail page
    console.log('Waiting for navigation to dispute detail...');
    await delay(3000); // Give some time for navigation
    await arbContext.page.waitForLoadState('networkidle');

    // Verify we're on dispute detail page
    await expect(arbContext.page.locator(`text=/${messageTexts.disputeDetail}/i`)).toBeVisible({ timeout: 10000 });

    // Step 6: Arbitrator clicks RESOLVE button
    console.log('Step 6: Arbitrator clicking RESOLVE button...');
    const resolveButton = arbContext.page.locator(`button:has-text("${buttonTexts.resolve}")`);
    await expect(resolveButton).toBeVisible();
    await resolveButton.click();

    // Wait for resolve modal to appear
    console.log('Waiting for resolve dispute modal...');
    await expect(arbContext.page.locator(`text=/${messageTexts.resolveDispute}/i`)).toBeVisible({ timeout: 5000 });

    return {
        buyerContext: { context: buyerContext_context, page: buyerPage },
        sellerContext,
        arbContext,
        localLink,
        orderId
    };
}

test.describe.serial('Dispute flow with buyer deposit', () => {
    test('Dispute flow with buyer deposit - Release to buyer with random security deposit choice', async ({ browser }) => {
        const { buyerContext, sellerContext, arbContext } = await executeCommonDisputeFlowWithDeposit(browser);
        const { context: buyerContext_context, page: buyerPage } = buyerContext;

        // Step 7: Release to buyer case
        console.log('Step 7: Arbitrator resolving dispute - Release to buyer...');
        // Get buyer name from the input placeholder "Type @name to release"
        const buyerNameInput = arbContext.page.locator('#input-buyer');
        await expect(buyerNameInput).toBeVisible();

        const placeholder = await buyerNameInput.getAttribute('placeholder');
        const buyerNameMatch = placeholder?.match(/@(\w+)/);
        const buyerName = buyerNameMatch ? `@${buyerNameMatch[1]}` : '@testArbb'; // fallback name

        console.log(`Extracted buyer name from placeholder: ${buyerName}`);

        // Fill in buyer name in the input field
        await buyerNameInput.fill(buyerName);

        // Click "Release to Buyer" button
        const releaseToBuyerButton = arbContext.page.locator(`button:has-text("${buttonTexts.releaseToBuyer}")`);
        await expect(releaseToBuyerButton).toBeVisible();
        await releaseToBuyerButton.click();

        // Step 8: Verify buyer receives the funds and sees security deposit options
        console.log('Step 8: Verifying buyer page shows successful release...');
        await expect(buyerPage.locator(`text=/Status:.*${statusTexts.released}/i`)).toBeVisible({ timeout: 15000 });
        await expect(buyerPage.locator(`text=/${messageTexts.successfullyReleased}/i`)).toBeVisible();

        // Step 9: Buyer makes random choice for security deposit options (similar to image-1)
        console.log('Step 9: Buyer making random choice for security deposit...');
        
        // Wait for buyer security deposit options to appear
        await delay(2000);
        await buyerPage.waitForSelector('input[type="radio"]', { timeout: 10000 });
        
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

        // Buyer clicks CLAIM button
        const buyerClaimButton = buyerPage.locator(`button:has-text("${buttonTexts.claim}")`);
        await expect(buyerClaimButton).toBeVisible();
        await buyerClaimButton.click();

        // Wait for final completion
        await expect(buyerPage.locator(`text=/${messageTexts.orderCompleted}/i`)).toBeVisible({ timeout: 15000 });

        console.log('Dispute flow with buyer deposit - Release to buyer with random choice - completed successfully!');

        // Clean up
        await buyerContext_context.close();
        await sellerContext.context.close();
        await arbContext.context.close();
    });

    test('Dispute flow with buyer deposit - Return to seller', async ({ browser }) => {
        const { buyerContext, sellerContext, arbContext } = await executeCommonDisputeFlowWithDeposit(browser);
        const { context: buyerContext_context, page: buyerPage } = buyerContext;

        // Step 7: Return to seller case
        console.log('Step 7: Arbitrator resolving dispute - Return to seller...');

        // Click on SELLER tab
        const sellerTab = arbContext.page.locator('#full-width-tab-Seller')
        await expect(sellerTab).toBeVisible();
        await sellerTab.click();

        // Get seller name from the input placeholder "Type @name to return"
        const sellerNameInput = arbContext.page.locator('#input-seller');
        await expect(sellerNameInput).toBeVisible();

        const placeholder = await sellerNameInput.getAttribute('placeholder');
        const sellerNameMatch = placeholder?.match(/@(\w+)/);
        const sellerName = sellerNameMatch ? `@${sellerNameMatch[1]}` : '@BoHsuu'; // fallback name

        console.log(`Extracted seller name from placeholder: ${sellerName}`);

        // Fill in seller name in the input field
        await sellerNameInput.fill(sellerName);

        // Click "Return to Seller" button
        const returnToSellerButton = arbContext.page.locator(`button:has-text("${buttonTexts.returnToSeller}")`);
        await expect(returnToSellerButton).toBeVisible();
        await returnToSellerButton.click();

        // Step 8: Verify seller receives the returned funds and gets radio button options  
        console.log('Step 8: Verifying seller page shows successful return with claim options...');
        await expect(sellerContext.page.locator(`text=/Status:.*${statusTexts.returned}/i`)).toBeVisible({ timeout: 15000 });
        await expect(sellerContext.page.locator(`text=/${messageTexts.successfullyReturned}/i`)).toBeVisible();

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

        // Click CLAIM FEE button
        const claimBackFeeButton = sellerContext.page.locator(`button:has-text("${buttonTexts.claim}")`);
        await expect(claimBackFeeButton).toBeVisible();
        await claimBackFeeButton.click();

        await expect(sellerContext.page.locator(`text=${messageTexts.orderCancelled}`)).toBeVisible();

        console.log('Dispute flow with buyer deposit - Return to seller - completed successfully!');

        // Clean up
        await buyerContext_context.close();
        await sellerContext.context.close();
        await arbContext.context.close();
    });
});
