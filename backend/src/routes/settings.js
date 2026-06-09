const router = require('express').Router()
const { query } = require('../config/database')
const { authenticate, authorize } = require('../middleware/auth')

// GET /api/settings  — all group settings
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

// PUT /api/settings  — update group settings (admin only)
router.put('/', authenticate, authorize('admin'), async (req, res) => {
  const allowed = [
    'name','description','type','is_public','require_approval','max_members',
    'share_price','shares_per_member','contribution_day',
    'loan_interest_rate','loan_max_multiplier','loan_repayment_months','loan_late_penalty',
    'mgr_fee_pct','mgr_terms',
    'fine_lateness','fine_absence','fine_rule_violation',
    'platform_terms',
  ]
  const sets = []
  const vals = []
  let i = 1
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      sets.push(`${key} = $${i++}`)
      vals.push(req.body[key])
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' })
  vals.push(req.user.group_id)

  try {
    const { rows } = await query(
      `UPDATE groups SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`,
      vals
    )
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
