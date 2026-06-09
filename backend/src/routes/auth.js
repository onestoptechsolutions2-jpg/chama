const router  = require('express').Router()
const bcrypt  = require('bcryptjs')
const jwt     = require('jsonwebtoken')
const { query } = require('../config/database')
const { authenticate } = require('../middleware/auth')

const sign = (userId) => jwt.sign(
  { userId },
  process.env.JWT_SECRET || 'changeme_jwt_secret_2024',
  { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
)

// POST /api/auth/register  — self-registration (no group yet)
router.post('/register', async (req, res) => {
  const { name, phone, email, password } = req.body
  if (!name || !password) return res.status(400).json({ error: 'Name and password required' })
  if (!email && !phone)   return res.status(400).json({ error: 'Email or phone required' })
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })

  try {
    const existing = await query(
      'SELECT id FROM users WHERE email = $1 OR phone = $2',
      [email || null, phone || null]
    )
    if (existing.rows[0]) return res.status(409).json({ error: 'Account already exists' })

    const hash = await bcrypt.hash(password, 10)
    const { rows } = await query(
      `INSERT INTO users (name, email, phone, password_hash, role, active)
       VALUES ($1,$2,$3,$4,'member',TRUE) RETURNING id, name, email, phone, role`,
      [name, email || null, phone || null, hash]
    )
    const user = rows[0]
    const token = sign(user.id)
    res.status(201).json({ token, user: { ...user, groups: [] } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, phone, password } = req.body
  if (!password) return res.status(400).json({ error: 'Password required' })
  if (!email && !phone) return res.status(400).json({ error: 'Email or phone required' })

  try {
    const { rows } = await query(
      `SELECT id, name, email, phone, role, password_hash, active
       FROM users
       WHERE (email = $1 OR phone = $2) AND active = TRUE
       LIMIT 1`,
      [email || null, phone || null]
    )
    const user = rows[0]
    if (!user) return res.status(401).json({ error: 'Invalid credentials' })

    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' })

    // Fetch all active group memberships
    const { rows: memberships } = await query(
      `SELECT gm.group_id, gm.role, g.name AS group_name, g.type AS group_type,
              m.id AS member_id
       FROM group_memberships gm
       JOIN groups g ON g.id = gm.group_id
       LEFT JOIN members m ON m.user_id = $1 AND m.group_id = gm.group_id AND m.active = TRUE
       WHERE gm.user_id = $1 AND gm.status = 'active'
       ORDER BY gm.created_at ASC`,
      [user.id]
    )

    const token = sign(user.id)
    res.json({
      token,
      user: {
        id:    user.id,
        name:  user.name,
        email: user.email,
        phone: user.phone,
        role:  user.role,
        // First group for backwards compat
        group_id:  memberships[0]?.group_id  || null,
        member_id: memberships[0]?.member_id || null,
      },
      groups: memberships,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/auth/me  — refresh profile + all groups
router.get('/me', authenticate, async (req, res) => {
  try {
    const { rows: memberships } = await query(
      `SELECT gm.group_id, gm.role, g.name AS group_name, g.type AS group_type,
              m.id AS member_id, m.capital, m.security, m.personal_savings,
              m.welfare_balance, m.total_fines, m.limit_reduced
       FROM group_memberships gm
       JOIN groups g ON g.id = gm.group_id
       LEFT JOIN members m ON m.user_id = $1 AND m.group_id = gm.group_id AND m.active = TRUE
       WHERE gm.user_id = $1 AND gm.status = 'active'
       ORDER BY gm.created_at ASC`,
      [req.user.id]
    )
    const active = memberships.find(g => g.group_id === req.user.group_id) || memberships[0]
    res.json({
      id:        req.user.id,
      name:      req.user.name,
      email:     req.user.email,
      phone:     req.user.phone,
      role:      req.user.role,
      group_id:  active?.group_id  || null,
      member_id: active?.member_id || null,
      groups: memberships,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req, res) => {
  const { current_password, new_password } = req.body
  if (!current_password || !new_password)
    return res.status(400).json({ error: 'Both passwords required' })
  if (new_password.length < 6)
    return res.status(400).json({ error: 'New password must be at least 6 characters' })

  try {
    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id])
    const ok = await bcrypt.compare(current_password, rows[0].password_hash)
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect' })
    const hash = await bcrypt.hash(new_password, 10)
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.user.id])
    res.json({ message: 'Password updated' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
