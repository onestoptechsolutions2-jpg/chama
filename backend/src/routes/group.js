const router = require('express').Router()
const { query } = require('../config/database')
const { authenticate, authorize } = require('../middleware/auth')

// GET /api/group  — get this group's profile
router.get('/', authenticate, async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM groups WHERE id = $1', [req.user.group_id])
    if (!rows[0]) return res.status(404).json({ error: 'Group not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// PUT /api/group  — update group profile (admin only)
router.put('/', authenticate, authorize('admin'), async (req, res) => {
  const {
    name, description, logo_url, founded_date, currency,
    meeting_day, meeting_time, meeting_venue,
    mgr_pool_amount, mgr_member_count,
    phone, email,
  } = req.body
  try {
    const { rows } = await query(
      `UPDATE groups SET
        name             = COALESCE($1, name),
        description      = COALESCE($2, description),
        logo_url         = COALESCE($3, logo_url),
        founded_date     = COALESCE($4, founded_date),
        currency         = COALESCE($5, currency),
        meeting_day      = COALESCE($6, meeting_day),
        meeting_time     = COALESCE($7, meeting_time),
        meeting_venue    = COALESCE($8, meeting_venue),
        mgr_pool_amount  = COALESCE($9, mgr_pool_amount),
        mgr_member_count = COALESCE($10, mgr_member_count),
        phone            = COALESCE($11, phone),
        email            = COALESCE($12, email),
        updated_at       = NOW()
       WHERE id = $13
       RETURNING *`,
      [name, description, logo_url, founded_date, currency,
       meeting_day, meeting_time, meeting_venue,
       mgr_pool_amount, mgr_member_count,
       phone, email,
       req.user.group_id]
    )
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
