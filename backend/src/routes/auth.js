const router  = require('express').Router()
const bcrypt  = require('bcryptjs')
const jwt     = require('jsonwebtoken')
const { query } = require('../config/database')
const { authenticate } = require('../middleware/auth')

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, phone, password } = req.body
  if (!password) return res.status(400).json({ error: 'Password required' })
  if (!email && !phone) return res.status(400).json({ error: 'Email or phone required' })

  try {
    const { rows } = await query(
      `SELECT u.*, m.id AS member_id
       FROM users u
       LEFT JOIN members m ON m.user_id = u.id
       WHERE (u.email = $1 OR u.phone = $2) AND u.active = TRUE
       LIMIT 1`,
      [email || null, phone || null]
    )
    const user = rows[0]
    if (!user) return res.status(401).json({ error: 'Invalid credentials' })

    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' })

    const token = jwt.sign(
      { userId: user.id, groupId: user.group_id, role: user.role },
      process.env.JWT_SECRET || 'changeme_jwt_secret_2024',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    )

    res.json({
      token,
      user: {
        id:        user.id,
        name:      user.name,
        email:     user.email,
        phone:     user.phone,
        role:      user.role,
        group_id:  user.group_id,
        member_id: user.member_id,
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/auth/me  — refresh own profile
router.get('/me', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.group_id,
              m.id AS member_id, m.capital, m.security, m.personal_savings,
              m.welfare_balance, m.total_fines, m.limit_reduced
       FROM users u
       LEFT JOIN members m ON m.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    )
    res.json(rows[0])
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
