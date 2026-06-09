const router = require('express').Router()
const { query } = require('../config/database')
const { authenticate, authorize } = require('../middleware/auth')

// GET /api/loans?status=active&member_id=
router.get('/', authenticate, async (req, res) => {
  const { status, member_id } = req.query
  const filters = ['l.group_id = $1']
  const vals    = [req.user.group_id]
  let i = 2
  if (status)    { filters.push(`l.status = $${i++}`);    vals.push(status) }
  if (member_id) { filters.push(`l.member_id = $${i++}`); vals.push(member_id) }

  try {
    const { rows } = await query(
      `SELECT l.*, m.name AS member_name, m.capital, m.security, m.personal_savings, m.limit_reduced
       FROM loans l
       JOIN members m ON m.id = l.member_id
       WHERE ${filters.join(' AND ')}
       ORDER BY l.created_at DESC`,
      vals
    )
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/loans  — approve new loan
router.post('/', authenticate, authorize('admin', 'treasurer'), async (req, res) => {
  const { member_id, principal, interest_rate = 20, purpose, issued_date, due_date } = req.body
  if (!member_id || !principal) return res.status(400).json({ error: 'member_id and principal required' })

  try {
    // Check member has no active loan
    const { rows: active } = await query(
      `SELECT id FROM loans WHERE member_id = $1 AND status IN ('active','extended','pending')`,
      [member_id]
    )
    if (active.length > 0) return res.status(400).json({ error: 'Member already has an active loan' })

    // Compute limit
    const { rows: [m] } = await query(
      'SELECT capital, security, personal_savings, limit_reduced FROM members WHERE id = $1 AND group_id = $2',
      [member_id, req.user.group_id]
    )
    if (!m) return res.status(404).json({ error: 'Member not found' })

    const savings = parseFloat(m.capital) + parseFloat(m.security) + parseFloat(m.personal_savings)
    const limit   = m.limit_reduced ? savings : savings * 2
    if (parseFloat(principal) > limit) {
      return res.status(400).json({ error: `Exceeds loan limit of ${limit}` })
    }

    const totalRepayable = Math.round(parseFloat(principal) * (1 + parseFloat(interest_rate) / 100))
    const dueD = due_date || (() => {
      const d = new Date(); d.setMonth(d.getMonth() + 3)
      return d.toISOString().split('T')[0]
    })()

    const { rows } = await query(
      `INSERT INTO loans
         (group_id, member_id, principal, interest_rate, total_repayable, amount_remaining,
          status, purpose, issued_date, due_date, approved_by)
       VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.user.group_id, member_id, principal, interest_rate, totalRepayable,
       'active', purpose || null, issued_date || new Date().toISOString().split('T')[0], dueD, req.user.id]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// PUT /api/loans/:id  — update status, extend, etc.
router.put('/:id', authenticate, authorize('admin', 'treasurer'), async (req, res) => {
  const { status, extended, limit_reduced_by_extension, amount_remaining, due_date } = req.body
  try {
    const { rows } = await query(
      `UPDATE loans SET
         status                    = COALESCE($1, status),
         extended                  = COALESCE($2, extended),
         limit_reduced_by_extension = COALESCE($3, limit_reduced_by_extension),
         amount_remaining          = COALESCE($4, amount_remaining),
         due_date                  = COALESCE($5, due_date),
         cleared_date              = CASE WHEN $1 = 'cleared' THEN CURRENT_DATE ELSE cleared_date END,
         updated_at                = NOW()
       WHERE id = $6 AND group_id = $7 RETURNING *`,
      [status, extended, limit_reduced_by_extension, amount_remaining, due_date,
       req.params.id, req.user.group_id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })

    // If extension reduced limit, update member flag
    if (limit_reduced_by_extension) {
      await query(
        'UPDATE members SET limit_reduced = TRUE, updated_at = NOW() WHERE id = $1',
        [rows[0].member_id]
      )
    }
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/loans/:id/repay  — record a repayment
router.post('/:id/repay', authenticate, authorize('admin', 'treasurer'), async (req, res) => {
  const { amount, reference, notes } = req.body
  if (!amount) return res.status(400).json({ error: 'Amount required' })

  const client = await require('../config/database').pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: [loan] } = await client.query(
      'SELECT * FROM loans WHERE id = $1 AND group_id = $2',
      [req.params.id, req.user.group_id]
    )
    if (!loan) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Loan not found' }) }

    await client.query(
      'INSERT INTO loan_repayments (loan_id, amount, reference, notes, recorded_by) VALUES ($1,$2,$3,$4,$5)',
      [loan.id, amount, reference || null, notes || null, req.user.id]
    )

    const newBal    = Math.max(0, parseFloat(loan.amount_remaining) - parseFloat(amount))
    const newStatus = newBal <= 0 ? 'cleared' : loan.status

    await client.query(
      `UPDATE loans SET amount_remaining = $1, status = $2,
        cleared_date = CASE WHEN $2 = 'cleared' THEN CURRENT_DATE ELSE cleared_date END,
        updated_at = NOW()
       WHERE id = $3`,
      [newBal, newStatus, loan.id]
    )

    await client.query('COMMIT')
    res.json({ amount_remaining: newBal, status: newStatus })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  } finally {
    client.release()
  }
})

// GET /api/loans/:id/repayments
router.get('/:id/repayments', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT r.*, u.name AS recorded_by_name
       FROM loan_repayments r
       LEFT JOIN users u ON u.id = r.recorded_by
       WHERE r.loan_id = $1
       ORDER BY r.created_at DESC`,
      [req.params.id]
    )
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
