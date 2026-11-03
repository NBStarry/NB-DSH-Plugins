// Disabled prototype, not a plugin entrypoint. Connection reserves the sole
// /api interceptor for Gateway. No transport or secret-return path is approved.
export function createRevealService() {
  throw new Error('Mobile link reveal is disabled: transport and ownership are not verified');
}
