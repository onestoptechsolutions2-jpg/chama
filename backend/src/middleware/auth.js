const jwt  = require('jsonwebtoken')
const { query } = require('../config/database')

// Verify JWT and attach user to req
async function authenticate(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' })
  }
  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    const { rows } = await query(
      'SELECT id, group_id, name, email, role, active FROM users WHERE id = $1',
      [payload.userId]
    )
    if (!rows[0] || !rows[0].active) {
      return res.status(401).json({ error: 'User not found or inactive' })
    }
    req.user = rows[0]
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

// Role guard factory — usage: authorize('admin','treasurer')
function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: insufficient role' })
    }
    next()
  }
}

module.exports = { authenticate, authorize }
