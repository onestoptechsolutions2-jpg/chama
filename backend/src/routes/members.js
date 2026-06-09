const router = require('express').Router()
const bcrypt = require('bcryptjs')
const { query } = require('../config/database')
const { authenticate, authorize } = require('../middleware/auth')

// GET /api/members
router.get('/', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT m.*, u.email AS user_email, u.role AS user_role
       FROM members m
       LEFT JOIN users u ON u.id = m.user_id
       WHERE m.group_id = $1 AND m.active = TRUE
       ORDER BY m.name ASC`,
      [req.user.group_id]
    )
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/members/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT m.*, u.email AS user_email, u.role AS user_role
       FROM members m
       LEFT JOIN users u ON u.id = m.user_id
       WHERE m.id = $1 AND m.group_id = $2`,
      [req.params.id, req.user.group_id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Member not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/members  — create member + optional user account (admin/treasurer)
router.post('/', authenticate, authorize('admin', 'treasurer'), async (req, res) => {
  const {
    name, phone, email, id_number,
    capital = 0, security = 0, personal_savings = 0, welfare_balance = 0,
    notes, joined_date,
    // Optional user account
    create_user = false, user_role = 'member', password,
  } = req.body

  if (!name) return res.status(400).json({ error: 'Name is required' })

  const client = await require('../config/database').pool.connect()
  try {
    await client.query('BEGIN')

    let userId = null
    if (create_user) {
      if (!password) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'Password required to create user account' })
      }
      const hash = await bcrypt.hash(password, 10)
      const ur = await client.query(
        `INSERT INTO users (group_id, name, email, phone, id_number, role, password_hash, joined_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8, CURRENT_DATE)) RETURNING id`,
        [req.user.group_id, name, email || null, phone || null, id_number || null,
         user_role, hash, joined_date || null]
      )
      userId = ur.rows[0].id
    }

    const mr = await client.query(
      `INSERT INTO members
         (group_id, user_id, name, phone, email, id_number,
          capital, security, personal_savings, welfare_balance, notes, joined_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12, CURRENT_DATE))
       RETURNING *`,
      [req.user.group_id, userId, name, phone || null, email || null,
       id_number || null, capital, security, personal_savings, welfare_balance,
       notes || null, joined_date || null]
    )

    await client.query('COMMIT')
    res.status(201).json(mr.rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  } finally {
    client.release()
  }
})

// PUT /api/members/:id  — update member (admin/treasurer, or self)
router.put('/:id', authenticate, async (req, res) => {
  const isSelf = req.user.member_id === parseInt(req.params.id)
  const isStaff = ['admin', 'treasurer'].includes(req.user.role)
  if (!isSelf && !isStaff) return res.status(403).json({ error: 'Forbidden' })

  const {
    name, phone, email, id_number, notes,
    capital, security, personal_savings, welfare_balance, total_fines, limit_reduced, active,
  } = req.body

  try {
    // Non-staff can only update contact info, not financial fields
    const fields = isStaff
      ? { name, phone, email, id_number, notes, capital, security, personal_savings, welfare_balance, total_fines, limit_reduced, active }
      : { phone, email, notes }

    const sets = []
    const vals = []
    let i = 1
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) { sets.push(`${k} = $${i++}`); vals.push(v) }
    }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' })
    vals.push(req.params.id, req.user.group_id)

    const { rows } = await query(
      `UPDATE members SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${i++} AND group_id = $${i} RETURNING *`,
      vals
    )
    if (!rows[0]) return res.status(404).json({ error: 'Member not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// DELETE /api/members/:id  — soft-delete (admin only)
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    await query(
      'UPDATE members SET active = FALSE, updated_at = NOW() WHERE id = $1 AND group_id = $2',
      [req.params.id, req.user.group_id]
    )
    res.json({ message: 'Member deactivated' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
