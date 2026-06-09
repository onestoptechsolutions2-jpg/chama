// ─────────────────────────────────────────────────────────────
//  NANOSOFT × TWENTY CRM — Step 10: Invite Team Members
//
//  BEFORE RUNNING:
//  Fill in each person's work email below, then run:
//    node 10-invite-team.js
//
//  This sends invitation emails via Twenty's GraphQL API.
//  Each person gets a link to join the workspace.
// ─────────────────────────────────────────────────────────────

const { BASE_URL, API_KEY } = require('./config');

// ── FILL IN TEAM EMAILS BEFORE RUNNING ───────────────────────
//  Use your company email addresses (e.g. name@nanosoft.co.ke)
//  Set email: null to skip that person (already in workspace).

const TEAM = [
  // ── Admins ──────────────────────────────────────────────────
  { name: 'Ashwin',  title: 'CEO',                        role: 'ADMIN',  email: 'ashwin@ntlafrica.com'},
  { name: 'Brian',   title: 'CTO',                        role: 'ADMIN',  email: 'brian@ntlafrica.com'},
  { name: 'Samuel',  title: 'COO & Senior Developer',     role: 'ADMIN',  email: 'samuel@ntlafrica.com'},
  // ── Members ─────────────────────────────────────────────────
  { name: 'Peter',   title: 'CFO',                        role: 'MEMBER', email: 'peter@ntlafrica.com'},
  { name: 'Sonam',   title: 'Head of Marketing',          role: 'MEMBER', email: 'sonam@ntlafrica.com'},
  { name: 'Shaza',   title: 'Technical Sales Engineer',   role: 'MEMBER', email: 'shaza@ntlafrica.com'},
  { name: 'Billy',   title: 'ICT Officer & Tech Lead',    role: 'ADMIN', email: 'samuel@ntlafrica.com'},
  { name: 'Victor',  title: 'Field Engineer',             role: 'MEMBER', email: 'victor@ntlafrica.com'},
  { name: 'Ronald',  title: 'Senior Systems Support',     role: 'MEMBER', email: 'ronald@ntlafrica.com'},
  { name: 'Allan',   title: 'Full Stack Developer',       role: 'MEMBER', email: 'allan@ntlafrica.com'},
  { name: 'Muchali', title: 'Accountant',                 role: 'MEMBER', email: 'muchai@ntlafrica.com'},
];

// ── Helpers ───────────────────────────────────────────────────

const GQL_URL = `${BASE_URL}/graphql`;
const HEADERS  = { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` };

async function gql(query, variables = {}) {
  const res = await fetch(GQL_URL, {
    method: 'POST', headers: HEADERS,
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
  if (data.errors?.length) throw new Error(data.errors.map(e => e.message).join('; '));
  return data.data;
}

// ── Send invitations ──────────────────────────────────────────

// Twenty GraphQL mutation for inviting workspace members.
// Role is sent as part of the invitation context.
const SEND_INVITE_MUTATION = `
  mutation SendInvitationLinks($emails: [String!]!) {
    sendInvitationLinks(emails: $emails) {
      result {
        email
        isNewInvitation
      }
      errors {
        code
        message
      }
    }
  }
`;

async function inviteMember(person) {
  if (!person.email) {
    console.log(`  ⏭  ${person.name} — email not set, skipping`);
    return;
  }

  console.log(`  → Inviting ${person.name} (${person.title}) <${person.email}> as ${person.role}...`);
  try {
    const data = await gql(SEND_INVITE_MUTATION, { emails: [person.email] });
    const result = data?.sendInvitationLinks?.result ?? [];
    const errors = data?.sendInvitationLinks?.errors ?? [];

    if (errors.length) {
      console.error(`  ✗ Error: ${errors.map(e => e.message).join(', ')}`);
    } else if (result.length) {
      const r = result[0];
      const tag = r.isNewInvitation ? '✓ invite sent' : '~ already invited';
      console.log(`  ${tag}: ${r.email}`);
    } else {
      console.log(`  ✓ Invitation sent`);
    }
  } catch (err) {
    // Try fallback REST endpoint if GraphQL mutation isn't available
    if (err.message?.includes('Unknown type') || err.message?.includes('Cannot query')) {
      await inviteViaRest(person);
    } else {
      console.error(`  ✗ ${person.name}: ${err.message}`);
    }
  }
}

async function inviteViaRest(person) {
  // Fallback: Twenty also exposes invitations via REST
  const res = await fetch(`${BASE_URL}/rest/workspace-invitations`, {
    method: 'POST', headers: HEADERS,
    body: JSON.stringify({ email: person.email, role: person.role }),
  });
  const data = await res.json();
  if (res.ok) {
    console.log(`  ✓ (REST fallback) Invited: ${person.email}`);
  } else {
    console.error(`  ✗ REST fallback failed: ${JSON.stringify(data)}`);
    console.log(`\n  ⚠  Manual invite needed for ${person.name}:`);
    console.log(`     Go to: ${BASE_URL}/settings/members`);
    console.log(`     Click + Invite → enter ${person.email} → role: ${person.role}`);
  }
}

// ── Role upgrade note ─────────────────────────────────────────
// Twenty sends invites at the default MEMBER role regardless of
// the API payload. After each ADMIN invite is accepted:
//   Settings → Members → find person → change role to Admin
//
// Admins: Ashwin, Brian, Samuel

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  NANOSOFT × TWENTY CRM — Team Invitations');
  console.log('═══════════════════════════════════════════════════════');

  // Check all emails are filled
  const missing = TEAM.filter(p => p.email === null);
  if (missing.length === TEAM.length) {
    console.error(`
  ✗  No emails configured.

  Open this file (10-invite-team.js) and fill in each person's
  email address in the TEAM array at the top. Example:

    { name: 'Ashwin', ..., email: 'ashwin@nanosoft.co.ke' },

  Then run: node 10-invite-team.js
`);
    process.exit(1);
  }

  if (missing.length > 0) {
    console.log(`\n  ℹ  ${missing.length} member(s) have no email set — will be skipped:`);
    missing.forEach(p => console.log(`     • ${p.name} (${p.title})`));
  }

  const toInvite = TEAM.filter(p => p.email !== null);
  console.log(`\n  Inviting ${toInvite.length} team member(s)...\n`);

  for (const person of toInvite) {
    await inviteMember(person);
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`
═══════════════════════════════════════════════════════
  ✓  Invitations sent!

  POST-INVITE CHECKLIST:
  ─────────────────────
  1. Go to: ${BASE_URL}/settings/members
  2. Upgrade these 3 members to Admin role after they accept:
       • Ashwin (CEO)
       • Brian  (CTO)
       • Samuel (COO)
  3. Ask each person to check their email (spam folder too)
  4. Each person clicks the invite link → creates password → joins

  If anyone doesn't receive it, re-run with just their email
  or invite manually: Settings → Members → + Invite
═══════════════════════════════════════════════════════
`);
}

main().catch(err => {
  console.error('\n✗  Fatal error:', err.message);
  process.exit(1);
});
