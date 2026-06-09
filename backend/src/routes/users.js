const router = require('express').Router()
const bcrypt = require('bcryptjs')
const { query } = require('../config/database')
const { authenticate, authorize } = require('../middleware/auth')

// GET /api/users  — admin only
router.get('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.active, u.joined_date,
              m.id AS member_id, m.name AS member_name
       FROM users u
       LEFT JOIN members m ON m.user_id = u.id
       WHERE u.group_id = $1
       ORDER BY u.name`,
      [req.user.group_id]
    )
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/users  — create a user account (admin)
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  const { name, email, phone, id_number, role = 'member', password, joined_date } = req.body
  if (!name || !password) return res.status(400).json({ error: 'name and password required' })

  try {
    const hash = await bcrypt.hash(password, 10)
    const { rows } = await query(
      `INSERT INTO users (group_id, name, email, phone, id_number, role, password_hash, joined_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, name, email, phone, role, active, joined_date`,
      [req.user.group_id, name, email || null, phone || null,
       id_number || null, role, hash, joined_date || null]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email already in use' })
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// PUT /api/users/:id  — update role or active status (admin)
router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  const { role, active, name, email, phone } = req.body
  try {
    const { rows } = await query(
      `UPDATE users SET
         role       = COALESCE($1, role),
         active     = COALESCE($2, active),
         name       = COALESCE($3, name),
         email      = COALESCE($4, email),
         phone      = COALESCE($5, phone),
         updated_at = NOW()
       WHERE id = $6 AND group_id = $7
       RETURNING id, name, email, phone, role, active`,
      [role, active, name, email, phone, req.params.id, req.user.group_id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/users/:id/reset-password  — admin resets a member's password
router.post('/:id/reset-password', authenticate, authorize('admin'), async (req, res) => {
  const { new_password } = req.body
  if (!new_password || new_password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' })
  try {
    const hash = await bcrypt.hash(new_password, 10)
    await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 AND group_id = $3',
      [hash, req.params.id, req.user.group_id]
    )
    res.json({ message: 'Password reset' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
