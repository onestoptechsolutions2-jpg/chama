const { Pool } = require('pg')

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'chama_db',
  user:     process.env.DB_USER     || 'postgres',
  password: String(process.env.DB_PASSWORD || 'chama_secret_2024'),
  ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
})

pool.on('error', (err) => {
  console.error('Unexpected DB error', err)
})

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
}
