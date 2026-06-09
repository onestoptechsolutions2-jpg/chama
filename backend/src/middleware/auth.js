const jwt    = require('jsonwebtoken')
const { query } = require('../config/database')

// Verify JWT → attach req.user with group context from X-Group-Id header
async function authenticate(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' })
  }
  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'changeme_jwt_secret_2024')
    const userId = payload.userId

    // Resolve group context from header or fall back to first active membership
    const groupId = req.headers['x-group-id'] ? parseInt(req.headers['x-group-id'], 10) : null

    let userRow, memberRow, membershipRole

    if (groupId) {
      // Verify user is an active member of this group
      const { rows } = await query(
        `SELECT u.id, u.name, u.email, u.phone, u.active,
                gm.role, gm.status AS membership_status,
                m.id AS member_id, m.capital, m.security, m.personal_savings,
                m.welfare_balance, m.total_fines, m.limit_reduced
         FROM users u
         JOIN group_memberships gm ON gm.user_id = u.id AND gm.group_id = $2 AND gm.status = 'active'
         LEFT JOIN members m ON m.user_id = u.id AND m.group_id = $2 AND m.active = TRUE
         WHERE u.id = $1 AND u.active = TRUE`,
        [userId, groupId]
      )
      if (!rows[0]) {
        return res.status(403).json({ error: 'Not a member of this group' })
      }
      req.user = { ...rows[0], group_id: groupId }
    } else {
      // No group header — resolve user + first active membership
      const { rows } = await query(
        `SELECT u.id, u.name, u.email, u.phone, u.active,
                gm.group_id, gm.role, gm.status AS membership_status,
                m.id AS member_id
         FROM users u
         LEFT JOIN group_memberships gm ON gm.user_id = u.id AND gm.status = 'active'
         LEFT JOIN members m ON m.user_id = u.id AND m.group_id = gm.group_id AND m.active = TRUE
         WHERE u.id = $1 AND u.active = TRUE
         ORDER BY gm.created_at ASC
         LIMIT 1`,
        [userId]
      )
      if (!rows[0] || !rows[0].active) {
        return res.status(401).json({ error: 'User not found or inactive' })
      }
      req.user = rows[0]
    }

    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

// Role guard — usage: authorize('admin','treasurer')
function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: insufficient role' })
    }
    next()
  }
}

module.exports = { authenticate, authorize }
