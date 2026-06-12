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

// ─────────────────────────────────────────────────────────────────────────────
// LOAN APPLICATIONS (member self-service)
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/loans/apply  — member submits application
router.post('/apply', authenticate, async (req, res) => {
  const { amount_requested, purpose, repayment_months = 3 } = req.body
  if (!amount_requested) return res.status(400).json({ error: 'amount_requested required' })

  const memberId = req.user.member_id
  if (!memberId) return res.status(400).json({ error: 'No member profile linked to your account' })

  try {
    // Block if already has active loan
    const { rows: active } = await query(
      `SELECT id FROM loans WHERE member_id = $1 AND status IN ('active','extended','pending')`,
      [memberId]
    )
    if (active.length > 0) return res.status(400).json({ error: 'You already have an active loan' })

    // Block if already has a pending application
    const { rows: pending } = await query(
      `SELECT id FROM loan_applications WHERE member_id = $1 AND status = 'pending'`,
      [memberId]
    )
    if (pending.length > 0) return res.status(400).json({ error: 'You already have a pending application' })

    // Check limit
    const { rows: [m] } = await query(
      'SELECT capital, security, personal_savings, limit_reduced FROM members WHERE id = $1 AND group_id = $2',
      [memberId, req.user.group_id]
    )
    if (!m) return res.status(404).json({ error: 'Member not found' })

    const savings = parseFloat(m.capital) + parseFloat(m.security) + parseFloat(m.personal_savings)
    const limit   = m.limit_reduced ? savings : savings * 2
    if (parseFloat(amount_requested) > limit) {
      return res.status(400).json({ error: `Exceeds your loan limit of Ksh ${limit.toLocaleString()}` })
    }

    const { rows } = await query(
      `INSERT INTO loan_applications (group_id, member_id, amount_requested, purpose, repayment_months)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.group_id, memberId, amount_requested, purpose || null, repayment_months]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/loans/applications  — admin/treasurer sees all, member sees own
router.get('/applications', authenticate, async (req, res) => {
  const isStaff = ['admin', 'treasurer', 'secretary'].includes(req.user.role)
  try {
    let rows
    if (isStaff) {
      const result = await query(
        `SELECT la.*, m.name AS member_name, m.phone AS member_phone,
                u.name AS reviewed_by_name
         FROM loan_applications la
         JOIN members m ON m.id = la.member_id
         LEFT JOIN users u ON u.id = la.reviewed_by
         WHERE la.group_id = $1
         ORDER BY la.created_at DESC`,
        [req.user.group_id]
      )
      rows = result.rows
    } else {
      const memberId = req.user.member_id
      if (!memberId) return res.json([])
      const result = await query(
        `SELECT la.*, u.name AS reviewed_by_name
         FROM loan_applications la
         LEFT JOIN users u ON u.id = la.reviewed_by
         WHERE la.member_id = $1
         ORDER BY la.created_at DESC`,
        [memberId]
      )
      rows = result.rows
    }
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// PATCH /api/loans/applications/:id  — admin approves or rejects
router.patch('/applications/:id', authenticate, authorize('admin', 'treasurer'), async (req, res) => {
  const { status, review_notes, interest_rate = 20, due_date } = req.body
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'status must be approved or rejected' })
  }

  const client = await require('../config/database').pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: [app] } = await client.query(
      'SELECT * FROM loan_applications WHERE id = $1 AND group_id = $2',
      [req.params.id, req.user.group_id]
    )
    if (!app) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Application not found' }) }
    if (app.status !== 'pending') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Application already reviewed' }) }

    let loanId = null
    if (status === 'approved') {
      // Compute total repayable
      const totalRepayable = Math.round(parseFloat(app.amount_requested) * (1 + parseFloat(interest_rate) / 100))
      const dueD = due_date || (() => {
        const d = new Date()
        d.setMonth(d.getMonth() + parseInt(app.repayment_months))
        return d.toISOString().split('T')[0]
      })()

      const { rows: [loan] } = await client.query(
        `INSERT INTO loans
           (group_id, member_id, principal, interest_rate, total_repayable, amount_remaining,
            status, purpose, issued_date, due_date, approved_by)
         VALUES ($1,$2,$3,$4,$5,$5,'active',$6,CURRENT_DATE,$7,$8) RETURNING id`,
        [req.user.group_id, app.member_id, app.amount_requested, interest_rate,
         totalRepayable, app.purpose, dueD, req.user.id]
      )
      loanId = loan.id
    }

    const { rows: [updated] } = await client.query(
      `UPDATE loan_applications
       SET status = $1, reviewed_by = $2, reviewed_at = NOW(),
           review_notes = $3, loan_id = $4, updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [status, req.user.id, review_notes || null, loanId, req.params.id]
    )

    await client.query('COMMIT')
    res.json(updated)
  } catch (err) {
    await client.query('ROLLBACK')
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  } finally {
    client.release()
  }
})

// DELETE /api/loans/applications/:id  — member cancels own pending application
router.delete('/applications/:id', authenticate, async (req, res) => {
  const memberId = req.user.member_id
  try {
    const { rows: [app] } = await query(
      'SELECT * FROM loan_applications WHERE id = $1',
      [req.params.id]
    )
    if (!app) return res.status(404).json({ error: 'Not found' })
    const isStaff = ['admin', 'treasurer'].includes(req.user.role)
    if (!isStaff && app.member_id !== memberId) return res.status(403).json({ error: 'Forbidden' })
    if (app.status !== 'pending') return res.status(400).json({ error: 'Only pending applications can be cancelled' })

    await query(
      `UPDATE loan_applications SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    )
    res.json({ message: 'Cancelled' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/loans/statement  — member's full financial statement
router.get('/statement', authenticate, async (req, res) => {
  const memberId = req.user.member_id
  const isStaff  = ['admin', 'treasurer', 'secretary'].includes(req.user.role)
  const targetId = isStaff && req.query.member_id ? parseInt(req.query.member_id) : memberId
  if (!targetId) return res.status(400).json({ error: 'No member profile' })

  try {
    const [member, contributions, loans, repayments, fines] = await Promise.all([
      query('SELECT * FROM members WHERE id = $1 AND group_id = $2', [targetId, req.user.group_id])
        .then(r => r.rows[0]),
      query(
        `SELECT 'contribution' AS type, c.amount, c.payment_date AS date,
                c.reference, c.notes, c.month_label AS description
         FROM contributions c WHERE c.member_id = $1 ORDER BY c.payment_date DESC`,
        [targetId]
      ).then(r => r.rows),
      query(
        `SELECT * FROM loans WHERE member_id = $1 AND group_id = $2 ORDER BY issued_date DESC`,
        [targetId, req.user.group_id]
      ).then(r => r.rows),
      query(
        `SELECT 'repayment' AS type, r.amount, r.created_at AS date,
                r.reference, r.notes, CONCAT('Loan repayment #', r.loan_id) AS description
         FROM loan_repayments r
         JOIN loans l ON l.id = r.loan_id
         WHERE l.member_id = $1 ORDER BY r.created_at DESC`,
        [targetId]
      ).then(r => r.rows),
      query(
        `SELECT 'fine' AS type, f.amount, f.created_at AS date,
                NULL AS reference, f.notes, f.reason AS description, f.status
         FROM fines f WHERE f.member_id = $1 ORDER BY f.created_at DESC`,
        [targetId]
      ).then(r => r.rows),
    ])

    if (!member) return res.status(404).json({ error: 'Member not found' })
    res.json({ member, contributions, loans, repayments, fines })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
