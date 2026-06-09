require('dotenv').config()
const fs   = require('fs')
const path = require('path')
const { pool } = require('../config/database')

async function migrate() {
  const sql = fs.readFileSync(
    path.join(__dirname, '../migrations/001_initial.sql'), 'utf8'
  )
  try {
    console.log('Running migration 001_initial.sql ...')
    await pool.query(sql)
    console.log('✅ Migration complete')
  } catch (err) {
    console.error('❌ Migration failed:', err.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

migrate()
