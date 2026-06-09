const router = require('express').Router()
const { query } = require('../config/database')
const { authenticate, authorize } = require('../middleware/auth')

// GET /api/welfare?status=&member_id=
router.get('/', authenticate, async (req, res) => {
  const { status, member_id, claim_type } = req.query
  const filters = ['c.group_id = $1']
  const vals    = [req.user.group_id]
  let i = 2
  if (status)     { filters.push(`c.status = $${i++}`);     vals.push(status) }
  if (member_id)  { filters.push(`c.member_id = $${i++}`);  vals.push(member_id) }
  if (claim_type) { filters.push(`c.claim_type = $${i++}`); vals.push(claim_type) }

  try {
    const { rows } = await query(
      `SELECT c.*, m.name AS member_name,
              u.name AS reviewed_by_name
       FROM welfare_claims c
       JOIN members m ON m.id = c.member_id
       LEFT JOIN users u ON u.id = c.reviewed_by
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

// POST /api/welfare  — member submits a claim
router.post('/', authenticate, async (req, res) => {
  const {
    member_id, beneficiary_name, beneficiary_rel,
    claim_type = 'other', amount_requested, description,
  } = req.body
  if (!member_id || !amount_requested || !claim_type)
    return res.status(400).json({ error: 'member_id, claim_type, amount_requested required' })

  try {
    const { rows } = await query(
      `INSERT INTO welfare_claims
         (group_id, member_id, beneficiary_name, beneficiary_rel,
          claim_type, amount_requested, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.group_id, member_id, beneficiary_name || null, beneficiary_rel || null,
       claim_type, amount_requested, description || null]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// PUT /api/welfare/:id  — admin reviews / approves / disburses
router.put('/:id', authenticate, authorize('admin', 'treasurer'), async (req, res) => {
  const { status, amount_approved, rejection_reason } = req.body
  const client = await require('../config/database').pool.connect()
  try {
    await client.query('BEGIN')

    const { rows } = await client.query(
      `UPDATE welfare_claims SET
         status           = COALESCE($1, status),
         amount_approved  = COALESCE($2, amount_approved),
         rejection_reason = COALESCE($3, rejection_reason),
         reviewed_by      = CASE WHEN $1 IN ('approved','rejected','under_review') THEN $4 ELSE reviewed_by END,
         reviewed_at      = CASE WHEN $1 IN ('approved','rejected','under_review') THEN NOW() ELSE reviewed_at END,
         disbursed_at     = CASE WHEN $1 = 'disbursed' THEN NOW() ELSE disbursed_at END,
         updated_at       = NOW()
       WHERE id = $5 AND group_id = $6 RETURNING *`,
      [status, amount_approved, rejection_reason, req.user.id, req.params.id, req.user.group_id]
    )
    if (!rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found' }) }

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

// GET /api/welfare/fund  — welfare fund summary
router.get('/fund', authenticate, async (req, res) => {
  try {
    const { rows: [pool] } = await query(
      `SELECT
         SUM(CASE WHEN c.type = 'welfare' AND c.status = 'paid' THEN c.amount ELSE 0 END) AS total_collected,
         SUM(CASE WHEN w.status = 'disbursed' THEN w.amount_approved ELSE 0 END) AS total_disbursed
       FROM contributions c
       CROSS JOIN (
         SELECT COALESCE(SUM(amount_approved),0) AS amount_approved, status
         FROM welfare_claims WHERE group_id = $1 AND status = 'disbursed'
         GROUP BY status
       ) w
       WHERE c.group_id = $1`,
      [req.user.group_id]
    )

    const collected  = parseFloat(pool?.total_collected  || 0)
    const disbursed  = parseFloat(pool?.total_disbursed  || 0)

    // Count by type
    const { rows: byType } = await query(
      `SELECT claim_type, COUNT(*) AS count, SUM(amount_approved) AS total
       FROM welfare_claims WHERE group_id = $1 AND status = 'disbursed'
       GROUP BY claim_type`,
      [req.user.group_id]
    )

    res.json({ total_collected: collected, total_disbursed: disbursed, balance: collected - disbursed, by_type: byType })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
