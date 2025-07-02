// UI Text Constants
export const orderDetailText = 'Order Detail';

// Button Text Constants
export const buttonTexts = {
  decline: 'Decline',
  escrow: 'Escrow',
  release: 'Release',
  cancel: 'Cancel',
  dispute: 'Dispute',
  claim: 'CLAIM',
  claimBackFee: 'CLAIM BACK FEE',
  createDispute: 'CREATE DISPUTE',
  goToDispute: 'GO TO DISPUTE',
  resolve: 'RESOLVE',
  releaseToBuyer: 'Release to Buyer',
  returnToSeller: 'Return to Seller'
} as const;

// Status Text Constants
export const statusTexts = {
  pending: 'Pending',
  escrowed: 'Escrowed',
  released: 'Released',
  completed: 'Completed',
  cancelled: 'Cancelled',
  returned: 'Returned',
  dispute: 'Dispute'
} as const;

// Success/Notification Message Constants
export const messageTexts = {
  escrowSuccess: 'Order escrowed successfully',
  escrowSuccessAlt: 'Order escrowed successfully!',
  releaseSuccess: 'successfully released',
  releaseSuccessAlt: 'Successfully Released!',
  orderCompleted: 'Order has been completed',
  orderCancelled: 'Order has been cancelled',
  confirmationModal: 'Confirmation',
  cancelConfirmation: 'Your order will be cancelled without a dispute',
  reclaimFee: 'You\'re able to reclaim the fee',
  claimFunds: 'You can claim the funds now',
  createDispute: 'Create dispute',
  disputeDetail: 'Dispute detail',
  resolveDispute: 'Resolve Dispute',
  pleaseResolveDispute: 'Please resolve the dispute',
  successfullyReturned: 'Successfully Returned!',
  successfullyReleased: 'Successfully Released!'
} as const;

// Security Deposit Options Constants
export const securityDepositOptions = {
  decline: 'decline',
  accept: 'accept'
} as const;

export const timeToLoadUtxos = 20000; // 15 seconds to load UTXOs