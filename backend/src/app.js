require('dotenv').config()
const express = require('express')
const cors    = require('cors')

const app = express()

// CORS
const originsEnv = process.env.CORS_ORIGINS || '*'
const origins = originsEnv.split(',').map(s => s.trim())
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || origins.includes('*') || origins.includes(origin)) return cb(null, true)
    cb(new Error('Not allowed by CORS'))
  },
  credentials: true,
}))

app.use(express.json())
app.use(express.urlencoded({ extended: false }))

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', time: new Date() }))

// Routes
app.use('/api/auth',          require('./routes/auth'))
app.use('/api/group',         require('./routes/group'))
app.use('/api/users',         require('./routes/users'))
app.use('/api/members',       require('./routes/members'))
app.use('/api/contributions', require('./routes/contributions'))
app.use('/api/loans',         require('./routes/loans'))
app.use('/api/mgr',           require('./routes/mgr'))
app.use('/api/fines',         require('./routes/fines'))
app.use('/api/meetings',      require('./routes/meetings'))
app.use('/api/welfare',       require('./routes/welfare'))
app.use('/api/projects',      require('./routes/projects'))
app.use('/api/rules',         require('./routes/rules'))
app.use('/api/dashboard',     require('./routes/dashboard'))

// 404
app.use((req, res) => res.status(404).json({ error: `Route ${req.method} ${req.path} not found` }))

// Error handler
app.use((err, req, res, _next) => {
  console.error(err)
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' })
})

module.exports = app
