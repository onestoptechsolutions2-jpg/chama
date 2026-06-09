const router = require('express').Router()
const { query } = require('../config/database')
const { authenticate, authorize } = require('../middleware/auth')

// GET /api/contributions?member_id=&type=&year=&month=
router.get('/', authenticate, async (req, res) => {
  const { member_id, type, year, month } = req.query
  const filters = ['c.group_id = $1']
  const vals    = [req.user.group_id]
  let i = 2
  if (member_id) { filters.push(`c.member_id = $${i++}`); vals.push(member_id) }
  if (type)      { filters.push(`c.type = $${i++}`);      vals.push(type) }
  if (year)      { filters.push(`c.year = $${i++}`);      vals.push(year) }
  if (month)     { filters.push(`c.month = $${i++}`);     vals.push(month) }

  try {
    const { rows } = await query(
      `SELECT c.*, m.name AS member_name
       FROM contributions c
       JOIN members m ON m.id = c.member_id
       WHERE ${filters.join(' AND ')}
       ORDER BY c.created_at DESC`,
      vals
    )
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/contributions
router.post('/', authenticate, authorize('admin', 'treasurer'), async (req, res) => {
  const { member_id, amount, type, month, year, status = 'paid', reference, notes } = req.body
  if (!member_id || !amount || !type)
    return res.status(400).json({ error: 'member_id, amount, and type are required' })

  const client = await require('../config/database').pool.connect()
  try {
    await client.query('BEGIN')

    const { rows } = await client.query(
      `INSERT INTO contributions (group_id, member_id, amount, type, month, year, status, reference, notes, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.user.group_id, member_id, amount, type, month || null, year || null,
       status, reference || null, notes || null, req.user.id]
    )

    // Update member balance
    const balanceField = {
      capital:          'capital',
      security:         'security',
      personal_savings: 'personal_savings',
      welfare:          'welfare_balance',
    }[type]

    if (balanceField && status === 'paid') {
      await client.query(
        `UPDATE members SET ${balanceField} = ${balanceField} + $1, updated_at = NOW()
         WHERE id = $2 AND group_id = $3`,
        [amount, member_id, req.user.group_id]
      )
    }

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

// PUT /api/contributions/:id
router.put('/:id', authenticate, authorize('admin', 'treasurer'), async (req, res) => {
  const { status, reference, notes, amount } = req.body
  try {
    const { rows } = await query(
      `UPDATE contributions
       SET status    = COALESCE($1, status),
           reference = COALESCE($2, reference),
           notes     = COALESCE($3, notes),
           amount    = COALESCE($4, amount)
       WHERE id = $5 AND group_id = $6
       RETURNING *`,
      [status, reference, notes, amount, req.params.id, req.user.group_id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/contributions/summary  — per-member totals
router.get('/summary', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT m.id, m.name,
              SUM(CASE WHEN c.type='capital'          AND c.status='paid' THEN c.amount ELSE 0 END) AS capital,
              SUM(CASE WHEN c.type='security'         AND c.status='paid' THEN c.amount ELSE 0 END) AS security,
              SUM(CASE WHEN c.type='personal_savings' AND c.status='paid' THEN c.amount ELSE 0 END) AS personal_savings,
              SUM(CASE WHEN c.type='mgr'              AND c.status='paid' THEN c.amount ELSE 0 END) AS mgr,
              SUM(CASE WHEN c.type='welfare'          AND c.status='paid' THEN c.amount ELSE 0 END) AS welfare,
              COUNT(CASE WHEN c.status='pending' THEN 1 END) AS pending_count
       FROM members m
       LEFT JOIN contributions c ON c.member_id = m.id
       WHERE m.group_id = $1 AND m.active = TRUE
       GROUP BY m.id, m.name
       ORDER BY m.name`,
      [req.user.group_id]
    )
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
