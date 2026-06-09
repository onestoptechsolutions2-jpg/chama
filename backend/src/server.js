require('dotenv').config()
const fs     = require('fs')
const path   = require('path')
const bcrypt = require('bcryptjs')
const app    = require('./app')
const { pool } = require('./config/database')

const PORT = process.env.PORT || 4000

async function runMigration(file) {
  const sql = fs.readFileSync(path.join(__dirname, 'migrations', file), 'utf8')
  await pool.query(sql)
  console.log(`✅ Migration ${file} applied`)
}

async function bootstrap() {
  const { rows } = await pool.query('SELECT COUNT(*) AS n FROM groups')
  if (parseInt(rows[0].n, 10) > 0) {
    // Ensure every existing admin user has a membership record
    await pool.query(`
      INSERT INTO group_memberships (user_id, group_id, role, status)
      SELECT u.id, u.group_id, u.role, 'active'
      FROM users u
      WHERE u.group_id IS NOT NULL
      ON CONFLICT (user_id, group_id) DO NOTHING
    `)
    return
  }

  const groupName = process.env.GROUP_NAME     || 'My Chama'
  const groupType = process.env.GROUP_TYPE     || 'chama'
  const adminName = process.env.ADMIN_NAME     || 'Admin'
  const adminEmail= process.env.ADMIN_EMAIL    || 'admin@chama.local'
  const adminPass = process.env.ADMIN_PASSWORD || 'Admin1234!'

  const gRes = await pool.query(
    `INSERT INTO groups (name, type, founded_date, is_public)
     VALUES ($1, $2, CURRENT_DATE, TRUE) RETURNING id`,
    [groupName, groupType]
  )
  const groupId = gRes.rows[0].id

  const hash = await bcrypt.hash(adminPass, 12)
  const uRes = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, group_id, active)
     VALUES ($1, $2, $3, 'admin', $4, TRUE)
     ON CONFLICT (email) DO UPDATE SET group_id = EXCLUDED.group_id RETURNING id`,
    [adminName, adminEmail, hash, groupId]
  )
  const userId = uRes.rows[0].id

  // Create membership record for admin
  await pool.query(
    `INSERT INTO group_memberships (user_id, group_id, role, status)
     VALUES ($1, $2, 'admin', 'active')
     ON CONFLICT (user_id, group_id) DO NOTHING`,
    [userId, groupId]
  )

  // Seed default rules (correct column names)
  const rules = [
    { num:'01', category:'contributions', title:'Monthly Contribution',  description:'Regular monthly savings deposit', penalty_amount:100 },
    { num:'02', category:'general',       title:'Meeting Attendance',    description:'Members must attend all meetings', penalty_amount:100 },
    { num:'03', category:'general',       title:'Lateness Fine',         description:'Fine for arriving late to meetings', penalty_amount:50 },
    { num:'04', category:'general',       title:'Respectful Conduct',    description:'Members must maintain respectful conduct', penalty_amount:200 },
  ]
  if (['chama','hybrid'].includes(groupType)) {
    rules.push(
      { num:'05', category:'loans', title:'Loan Interest Rate',    description:'Interest charged on member loans', penalty_amount:0 },
      { num:'06', category:'loans', title:'Late Loan Repayment',   description:'Fine for missing loan repayment', penalty_amount:500 }
    )
  }
  if (['welfare','hybrid'].includes(groupType)) {
    rules.push(
      { num:'07', category:'general', title:'Welfare Contribution', description:'Monthly welfare fund contribution', penalty_amount:50 }
    )
  }
  for (const r of rules) {
    await pool.query(
      `INSERT INTO rules (group_id, rule_number, category, title, description, penalty_amount)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [groupId, r.num, r.category, r.title, r.description, r.penalty_amount]
    )
  }

  // Seed first MGR cycle
  await pool.query(
    `INSERT INTO mgr_cycles (group_id, cycle_number, status) VALUES ($1, 1, 'active')`,
    [groupId]
  )

  console.log(`✅ Bootstrapped: group "${groupName}" (${groupType}), admin: ${adminEmail}`)
}

async function start() {
  try {
    await pool.query('SELECT 1')
    console.log('✅ Database connected')
  } catch (err) {
    console.error('❌ Database connection failed:', err.message)
    console.error('   DB_HOST:', process.env.DB_HOST, '  DB_USER:', process.env.DB_USER)
    process.exit(1)
  }

  try {
    await runMigration('001_initial.sql')
    await runMigration('002_multi_group.sql')
    await runMigration('003_mgr_dynamic.sql')
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
