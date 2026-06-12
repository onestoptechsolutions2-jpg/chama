// Probe: find auth endpoints and all available mutations
// Run: node probe-auth.js

const { BASE_URL, API_KEY } = require('./config');
const GQL_URL = `${BASE_URL}/graphql`;
const AUTH_HDR = { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` };

async function main() {
  // 1. List ALL mutations using the API key
  console.log('=== ALL MUTATIONS (with API key) ===');
  const res = await fetch(GQL_URL, {
    method: 'POST', headers: AUTH_HDR,
    body: JSON.stringify({ query: `query { __schema { mutationType { fields { name } } } }` }),
  });
  const data = await res.json();
  const names = (data?.data?.__schema?.mutationType?.fields ?? []).map(f => f.name).sort();
  console.log(names.join('\n') || '(none)');

  // 2. Try REST auth endpoints
  console.log('\n=== TRYING REST AUTH ENDPOINTS ===');
  const creds = { email: 'info@ntlafrica.com', password: 'some' };
  const restPaths = [
    '/auth/token',
    '/api/auth/token',
    '/auth/sign-in',
    '/auth/login',
    '/api/auth/login',
    '/token',
  ];
  for (const path of restPaths) {
    try {
      const r = await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      });
      const d = await r.json().catch(() => null);
      console.log(`${r.status} ${path}:`, JSON.stringify(d)?.slice(0, 120));
    } catch (e) {
      console.log(`ERR  ${path}: ${e.message}`);
    }
  }

  // 3. Check what queries are available
  console.log('\n=== AVAILABLE QUERIES (sample) ===');
  const qres = await fetch(GQL_URL, {
    method: 'POST', headers: AUTH_HDR,
    body: JSON.stringify({ query: `query { __schema { queryType { fields { name } } } }` }),
  });
  const qdata = await qres.json();
  const qnames = (qdata?.data?.__schema?.queryType?.fields ?? []).map(f => f.name).sort();
  const viewQ = qnames.filter(n => /view|auth|session/i.test(n));
  console.log('View/auth-related queries:', viewQ.join(', ') || '(none)');
}

main().catch(e => { console.error(e.message); process.exit(1); });
