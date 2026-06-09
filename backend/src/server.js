require('dotenv').config()
const fs   = require('fs')
const path = require('path')
const bcrypt = require('bcryptjs')
const app  = require('./app')
const { pool } = require('./config/database')

const PORT = process.env.PORT || 4000

// ── 1. Run migration (idempotent — all CREATE TABLE IF NOT EXISTS) ──────────
async function migrate() {
  const sql = fs.readFileSync(
    path.join(__dirname, 'migrations', '001_initial.sql'),
    'utf8'
  )
  await pool.query(sql)
  console.log('✅ Migration applied')
}

// ── 2. Bootstrap default group + admin if DB is empty ──────────────────────
async function bootstrap() {
  const { rows } = await pool.query('SELECT COUNT(*) AS n FROM groups')
  if (parseInt(rows[0].n, 10) > 0) return // already seeded

  const groupName = process.env.GROUP_NAME     || 'My Chama'
  const groupType = process.env.GROUP_TYPE     || 'chama'
  const adminName = process.env.ADMIN_NAME     || 'Admin'
  const adminEmail= process.env.ADMIN_EMAIL    || 'admin@chama.local'
  const adminPass = process.env.ADMIN_PASSWORD || 'Admin1234!'

  // Create group
  const gRes = await pool.query(
    `INSERT INTO groups (name, type, founded_date)
     VALUES ($1, $2, CURRENT_DATE) RETURNING id`,
    [groupName, groupType]
  )
  const groupId = gRes.rows[0].id

  // Create admin user (no member record — pure admin account)
  const hash = await bcrypt.hash(adminPass, 12)
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role, group_id, active)
     VALUES ($1, $2, $3, 'admin', $4, TRUE)
     ON CONFLICT (email) DO NOTHING`,
    [adminName, adminEmail, hash, groupId]
  )

  // Seed default rules based on group type
  const rules = [
    // Universal
    { category:'contributions', name:'Monthly Contribution', description:'Regular monthly savings deposit', penalty_amount:100, frequency:'monthly', is_mandatory:true },
    { category:'attendance',    name:'Meeting Attendance',   description:'Members must attend all meetings', penalty_amount:100, frequency:'per_meeting', is_mandatory:true },
    { category:'attendance',    name:'Lateness Fine',        description:'Fine for arriving late to meetings', penalty_amount:50, frequency:'per_occurrence', is_mandatory:true },
    { category:'conduct',       name:'Respectful Conduct',   description:'Members must maintain respectful conduct at all times', penalty_amount:200, frequency:'per_occurrence', is_mandatory:true },
  ]

  if (['chama','hybrid'].includes(groupType)) {
    rules.push(
      { category:'loans', name:'Loan Interest Rate', description:'Interest charged on member loans', penalty_amount:0, frequency:'per_loan', is_mandatory:false },
      { category:'loans', name:'Late Loan Repayment', description:'Fine for missing loan repayment deadline', penalty_amount:500, frequency:'per_month', is_mandatory:true }
    )
  }
  if (['welfare','hybrid'].includes(groupType)) {
    rules.push(
      { category:'welfare', name:'Welfare Contribution', description:'Monthly welfare fund contribution', penalty_amount:50, frequency:'monthly', is_mandatory:true }
    )
  }

  for (const r of rules) {
    await pool.query(
      `INSERT INTO rules (group_id, category, name, description, penalty_amount, frequency, is_mandatory)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [groupId, r.category, r.name, r.description, r.penalty_amount, r.frequency, r.is_mandatory]
    )
  }

  console.log(`✅ Bootstrapped: group "${groupName}" (${groupType}), admin: ${adminEmail}`)
}

// ── Startup ─────────────────────────────────────────────────────────────────
async function start() {
  try {
    await pool.query('SELECT 1')
    console.log('✅ Database connected')
  } catch (err) {
    console.error('❌ Database connection failed:', err.message)
    process.exit(1)
  }

  try {
    await migrate()
    await bootstrap()
  } catch (err) {
    console.error('❌ Startup error:', err.message)
    process.exit(1)
  }

  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`)
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`)
  })
}

start()
