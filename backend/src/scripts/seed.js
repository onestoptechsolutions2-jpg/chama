/**
 * Seed script — creates ONE group with admin + 10 members.
 * Run: node src/scripts/seed.js
 *
 * Set GROUP_TYPE env var to: chama | welfare | hybrid | selfhelp
 */
require('dotenv').config()
const bcrypt = require('bcryptjs')
const { pool } = require('../config/database')

const GROUP_TYPE = process.env.GROUP_TYPE || 'chama'
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@chama.local'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin1234!'

const CHAMA_MEMBERS = [
  { name: 'Alice Wanjiku',   phone: '0712000001', capital: 10000, security: 3000 },
  { name: 'Bob Kamau',       phone: '0712000002', capital: 10000, security: 3000 },
  { name: 'Carol Njeri',     phone: '0712000003', capital: 10000, security: 3000 },
  { name: 'David Mwangi',    phone: '0712000004', capital: 10000, security: 3000 },
  { name: 'Eve Achieng',     phone: '0712000005', capital: 10000, security: 3000 },
  { name: 'Frank Otieno',    phone: '0712000006', capital: 10000, security: 3000 },
  { name: 'Grace Wambui',    phone: '0712000007', capital: 10000, security: 3000 },
  { name: 'Henry Kipchoge',  phone: '0712000008', capital: 10000, security: 3000 },
  { name: 'Irene Zawadi',    phone: '0712000009', capital: 10000, security: 3000 },
  { name: 'James Mutua',     phone: '0712000010', capital: 10000, security: 3000 },
]

const RULES_BY_TYPE = {
  chama: [
    { num:'01', cat:'contributions', title:'MGR Contribution', desc:'Merry-go-round contribution: Ksh 5,000 per member per month.', penalty:null },
    { num:'02', cat:'mgr',           title:'MGR Payout',       desc:'Two members receive MGR each month — Ksh 50,000 each from a Ksh 100,000 pool.' },
    { num:'03', cat:'contributions', title:'Security Fee',      desc:'Security fee: Ksh 3,000. Pay early to receive full payout with no deduction.', penalty:3000 },
    { num:'04', cat:'contributions', title:'Capital',           desc:'Capital contribution: Ksh 10,000 per member.' },
    { num:'05', cat:'loans',         title:'First Loan',        desc:'First loan starts at Ksh 8,000 at 20% interest, repayable over 3 months.' },
    { num:'06', cat:'loans',         title:'Loan Extension',    desc:'If not cleared within 3 months, one extension month is granted and future loan limit is permanently reduced by 50%.', penalty:null },
    { num:'07', cat:'loans',         title:'Loan vs MGR',       desc:'Loans and MGR are independent. A member with a loan still receives their full MGR payout.' },
    { num:'08', cat:'contributions', title:'Personal Savings',  desc:'Personal savings: minimum Ksh 500 per month.' },
    { num:'09', cat:'loans',         title:'Loan Limit',        desc:'Loan limit = 2× total savings (capital + security + personal savings).' },
    { num:'10', cat:'meetings',      title:'Meetings',          desc:'Chama meetings: every first Sunday of the month, starting at 3:00 PM.' },
    { num:'11', cat:'fines',         title:'Fines',             desc:'Latecomer fine: Ksh 50. Absenteeism fine: Ksh 100.', penalty:100 },
  ],
  welfare: [
    { num:'01', cat:'contributions', title:'Monthly Welfare Contribution', desc:'Each member contributes Ksh 500 per month to the welfare fund.' },
    { num:'02', cat:'welfare',       title:'Medical Claim',     desc:'Medical/hospital claims: up to Ksh 10,000 per incident, once per year.' },
    { num:'03', cat:'welfare',       title:'Bereavement',       desc:'Bereavement support (self/spouse/child): Ksh 5,000 disbursed within 48 hours.' },
    { num:'04', cat:'welfare',       title:'Emergency',         desc:'Emergency claims reviewed within 3 business days.' },
    { num:'05', cat:'general',       title:'Claim Eligibility', desc:'Members must have at least 3 months of contributions before claiming.' },
    { num:'06', cat:'meetings',      title:'Meetings',          desc:'Welfare meetings: every third Saturday of the month at 2:00 PM.' },
    { num:'07', cat:'fines',         title:'Fines',             desc:'Latecomer fine: Ksh 50. Absenteeism fine: Ksh 100.', penalty:100 },
  ],
  selfhelp: [
    { num:'01', cat:'contributions', title:'Monthly Table Banking', desc:'Minimum monthly contribution: Ksh 1,000 to the table banking pool.' },
    { num:'02', cat:'loans',         title:'Table Banking Loan',    desc:'Members may borrow up to 3× their saved amount at 10% interest.' },
    { num:'03', cat:'projects',      title:'Group Projects',        desc:'All members vote on group investment projects. Majority rules.' },
    { num:'04', cat:'meetings',      title:'Meetings',              desc:'Meetings: every second Saturday at 2:00 PM.' },
    { num:'05', cat:'fines',         title:'Fines',                 desc:'Latecomer fine: Ksh 50. Absenteeism fine: Ksh 100.', penalty:100 },
  ],
}
RULES_BY_TYPE.hybrid = [...RULES_BY_TYPE.chama, ...RULES_BY_TYPE.welfare.slice(0,4)]

async function seed() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Group
    const gr = await client.query(
      `INSERT INTO groups (name, type, description, currency, meeting_day, meeting_time, mgr_pool_amount)
       VALUES ($1,$2,$3,'KES','first_sunday','15:00',100000) RETURNING id`,
      [`Sample ${GROUP_TYPE.charAt(0).toUpperCase()+GROUP_TYPE.slice(1)} Group`, GROUP_TYPE,
       `Demo ${GROUP_TYPE} group created by seed script`]
    )
    const groupId = gr.rows[0].id

    // Admin user
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10)
    await client.query(
      `INSERT INTO users (group_id, name, email, role, password_hash)
       VALUES ($1,'Admin',$2,'admin',$3)`,
      [groupId, ADMIN_EMAIL, hash]
    )

    // Members + user accounts
    for (const m of CHAMA_MEMBERS) {
      const mHash = await bcrypt.hash('Member1234!', 10)
      const email = m.name.toLowerCase().replace(/\s+/g, '.') + '@chama.local'

      const ur = await client.query(
        `INSERT INTO users (group_id, name, email, phone, role, password_hash)
         VALUES ($1,$2,$3,$4,'member',$5) RETURNING id`,
        [groupId, m.name, email, m.phone, mHash]
      )
      await client.query(
        `INSERT INTO members (group_id, user_id, name, phone, email, capital, security)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [groupId, ur.rows[0].id, m.name, m.phone, email, m.capital, m.security]
      )
    }

    // Rules
    const rules = RULES_BY_TYPE[GROUP_TYPE] || RULES_BY_TYPE.chama
    for (const r of rules) {
      await client.query(
        `INSERT INTO rules (group_id, rule_number, category, title, description, penalty_amount)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [groupId, r.num, r.cat, r.title || null, r.desc, r.penalty || null]
      )
    }

    // MGR schedule (chama/hybrid only)
    if (['chama','hybrid'].includes(GROUP_TYPE)) {
      const months = [
        'January 2025','February 2025','March 2025','April 2025','May 2025','June 2025',
        'July 2025','August 2025','September 2025','October 2025',
      ]
      for (let i = 0; i < months.length; i++) {
        await client.query(
          `INSERT INTO mgr_schedule (group_id, month_index, month, pool_amount, status)
           VALUES ($1,$2,$3,100000,'pending')`,
          [groupId, i + 1, months[i]]
        )
      }
    }

    await client.query('COMMIT')

    console.log(`✅ Seed complete for group type: ${GROUP_TYPE}`)
    console.log(`   Admin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`)
    console.log(`   Member login example: alice.wanjiku@chama.local / Member1234!`)
    console.log(`   Group ID: ${groupId}`)
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('❌ Seed failed:', err.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

seed()
