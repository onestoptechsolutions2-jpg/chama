const router = require('express').Router()
const { query } = require('../config/database')
const { authenticate, authorize } = require('../middleware/auth')

// GET /api/mgr
router.get('/', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT s.*,
              m1.name AS member1_name, m1.id AS member1_id,
              m2.name AS member2_name, m2.id AS member2_id
       FROM mgr_schedule s
       LEFT JOIN members m1 ON m1.id = s.member1_id
       LEFT JOIN members m2 ON m2.id = s.member2_id
       WHERE s.group_id = $1
       ORDER BY s.month_index ASC`,
      [req.user.group_id]
    )
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/mgr
router.post('/', authenticate, authorize('admin', 'treasurer'), async (req, res) => {
  const { month_index, month, member1_id, member2_id, pool_amount = 100000 } = req.body
  if (!month_index || !month) return res.status(400).json({ error: 'month_index and month required' })
  try {
    const { rows } = await query(
      `INSERT INTO mgr_schedule (group_id, month_index, month, member1_id, member2_id, pool_amount)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.group_id, month_index, month, member1_id || null, member2_id || null, pool_amount]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// PUT /api/mgr/:id
router.put('/:id', authenticate, authorize('admin', 'treasurer'), async (req, res) => {
  const { month, member1_id, member2_id, pool_amount, status, paid_date, notes } = req.body
  try {
    const { rows } = await query(
      `UPDATE mgr_schedule SET
         month       = COALESCE($1, month),
         member1_id  = COALESCE($2, member1_id),
         member2_id  = COALESCE($3, member2_id),
         pool_amount = COALESCE($4, pool_amount),
         status      = COALESCE($5, status),
         paid_date   = COALESCE($6, paid_date),
         notes       = COALESCE($7, notes),
         updated_at  = NOW()
       WHERE id = $8 AND group_id = $9
       RETURNING *`,
      [month, member1_id, member2_id, pool_amount, status, paid_date, notes,
       req.params.id, req.user.group_id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// DELETE /api/mgr/:id
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    await query('DELETE FROM mgr_schedule WHERE id = $1 AND group_id = $2', [req.params.id, req.user.group_id])
    res.json({ message: 'Deleted' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
