const router = require('express').Router()
const { query } = require('../config/database')
const { authenticate, authorize } = require('../middleware/auth')

// GET /api/fines?member_id=&status=
router.get('/', authenticate, async (req, res) => {
  const { member_id, status } = req.query
  const filters = ['f.group_id = $1']
  const vals    = [req.user.group_id]
  let i = 2
  if (member_id) { filters.push(`f.member_id = $${i++}`); vals.push(member_id) }
  if (status)    { filters.push(`f.status = $${i++}`);    vals.push(status) }

  try {
    const { rows } = await query(
      `SELECT f.*, m.name AS member_name
       FROM fines f
       JOIN members m ON m.id = f.member_id
       WHERE ${filters.join(' AND ')}
       ORDER BY f.created_at DESC`,
      vals
    )
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/fines
router.post('/', authenticate, authorize('admin', 'treasurer', 'secretary'), async (req, res) => {
  const { member_id, type = 'other', amount, reason, meeting_date } = req.body
  if (!member_id || amount === undefined) return res.status(400).json({ error: 'member_id and amount required' })

  const client = await require('../config/database').pool.connect()
  try {
    await client.query('BEGIN')

    const { rows } = await client.query(
      `INSERT INTO fines (group_id, member_id, type, amount, reason, meeting_date, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.group_id, member_id, type, amount, reason || null,
       meeting_date || null, req.user.id]
    )

    // Add to member total_fines
    await client.query(
      'UPDATE members SET total_fines = total_fines + $1, updated_at = NOW() WHERE id = $2',
      [amount, member_id]
    )

    await client.query('COMMIT')
    res.status(201).json(rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  } finally {
    client.release()
  }
})

// PUT /api/fines/:id
router.put('/:id', authenticate, authorize('admin', 'treasurer'), async (req, res) => {
  const { status, amount, reason } = req.body
  const client = await require('../config/database').pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: [old] } = await client.query(
      'SELECT * FROM fines WHERE id = $1 AND group_id = $2',
      [req.params.id, req.user.group_id]
    )
    if (!old) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }) }

    const { rows } = await client.query(
      `UPDATE fines SET
         status     = COALESCE($1, status),
         amount     = COALESCE($2, amount),
         reason     = COALESCE($3, reason),
         updated_at = NOW()
       WHERE id = $4 AND group_id = $5 RETURNING *`,
      [status, amount, reason, req.params.id, req.user.group_id]
    )

    // If marking paid, adjust member total_fines
    if (status === 'paid' && old.status !== 'paid') {
      await client.query(
        'UPDATE members SET total_fines = GREATEST(0, total_fines - $1), updated_at = NOW() WHERE id = $2',
        [old.amount, old.member_id]
      )
    }
    // If waived
    if (status === 'waived' && old.status === 'pending') {
      await client.query(
        'UPDATE members SET total_fines = GREATEST(0, total_fines - $1), updated_at = NOW() WHERE id = $2',
        [old.amount, old.member_id]
      )
    }

    await client.query('COMMIT')
    res.json(rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  } finally {
    client.release()
  }
})

module.exports = router
