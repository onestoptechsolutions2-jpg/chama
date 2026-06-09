const router = require('express').Router()
const { query } = require('../config/database')
const { authenticate } = require('../middleware/auth')

// GET /api/dashboard  — all stats in one call
router.get('/', authenticate, async (req, res) => {
  const gid = req.user.group_id
  try {
    const [group, memberStats, loanStats, welfareStats, mgrNext, recentFines] = await Promise.all([
      // Group info
      query('SELECT * FROM groups WHERE id = $1', [gid]).then(r => r.rows[0]),

      // Member financial totals
      query(
        `SELECT
           COUNT(*) AS total_members,
           SUM(capital)          AS total_capital,
           SUM(security)         AS total_security,
           SUM(personal_savings) AS total_personal_savings,
           SUM(welfare_balance)  AS total_welfare,
           SUM(total_fines)      AS total_fines_outstanding
         FROM members WHERE group_id = $1 AND active = TRUE`,
        [gid]
      ).then(r => r.rows[0]),

      // Loan stats
      query(
        `SELECT
           COUNT(*) FILTER (WHERE status IN ('active','extended')) AS active_loans,
           SUM(amount_remaining) FILTER (WHERE status IN ('active','extended')) AS outstanding_balance,
           COUNT(*) FILTER (WHERE status = 'overdue') AS overdue_loans,
           COUNT(*) FILTER (WHERE status = 'cleared') AS cleared_loans
         FROM loans WHERE group_id = $1`,
        [gid]
      ).then(r => r.rows[0]),

      // Welfare stats (only if welfare/hybrid)
      query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'pending') AS pending_claims,
           COUNT(*) FILTER (WHERE status = 'approved') AS approved_claims,
           SUM(amount_approved) FILTER (WHERE status = 'disbursed') AS total_disbursed
         FROM welfare_claims WHERE group_id = $1`,
        [gid]
      ).then(r => r.rows[0]),

      // Next MGR entry
      query(
        `SELECT s.*, m1.name AS member1_name, m2.name AS member2_name
         FROM mgr_schedule s
         LEFT JOIN members m1 ON m1.id = s.member1_id
         LEFT JOIN members m2 ON m2.id = s.member2_id
         WHERE s.group_id = $1 AND s.status = 'pending'
         ORDER BY s.month_index ASC LIMIT 1`,
        [gid]
      ).then(r => r.rows[0] || null),

      // Recent fines
      query(
        `SELECT f.*, m.name AS member_name
         FROM fines f JOIN members m ON m.id = f.member_id
         WHERE f.group_id = $1 AND f.status = 'pending'
         ORDER BY f.created_at DESC LIMIT 5`,
        [gid]
      ).then(r => r.rows),
    ])

    res.json({
      group,
      members: memberStats,
      loans: loanStats,
      welfare: welfareStats,
      mgr_next: mgrNext,
      recent_fines: recentFines,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
