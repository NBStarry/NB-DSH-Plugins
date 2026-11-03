// Disabled candidate only: never registers a route or accesses credentials.
// When registered as an exact Connection Fetch route, the Connection shared
// handler must perform its owner admission *before* calling this function. This
// callback itself receives no peer and cannot independently verify owner.
// A child spawn/status match is not an authority-resource-generation snapshot;
// the lifecycle has no such snapshot, so a success path is intentionally absent.
const headers = { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' };
function failure(status, message, extra = {}) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { ...headers, ...extra } });
}
export function createFetchRevealCandidate() {
  return async request => {
    if (request.method !== 'POST') return failure(405, 'Method not allowed', { allow: 'POST' });
    // Includes already-aborted requests. No asynchronous verification or token
    // generation occurs, so there is no pending credential work to cancel.
    return failure(503, 'Mobile connection unavailable');
  };
}
