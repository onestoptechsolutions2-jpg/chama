const router = require('express').Router()
const { query, pool } = require('../config/database')
const { authenticate, authorize } = require('../middleware/auth')

// ─── MGR Cycles ───────────────────────────────────────────────

// GET /api/mgr/cycles
router.get('/cycles', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT c.*, COUNT(s.id) AS slot_count
       FROM mgr_cycles c
       LEFT JOIN mgr_schedule s ON s.cycle_id = c.id
       WHERE c.group_id = $1
       GROUP BY c.id ORDER BY c.cycle_number DESC`,
      [req.user.group_id]
    )
    res.json(rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

// POST /api/mgr/cycles  — start a new cycle (admin)
router.post('/cycles', authenticate, authorize('admin'), async (req, res) => {
  const { notes } = req.body
  try {
    // Close current active cycle first
    await query(
      `UPDATE mgr_cycles SET status = 'completed', completed_at = NOW(), updated_at = NOW()
       WHERE group_id = $1 AND status = 'active'`,
      [req.user.group_id]
    )
    const { rows: last } = await query(
      'SELECT COALESCE(MAX(cycle_number),0) AS n FROM mgr_cycles WHERE group_id = $1',
      [req.user.group_id]
    )
    const newNum = parseInt(last[0].n, 10) + 1
    const { rows } = await query(
      `INSERT INTO mgr_cycles (group_id, cycle_number, status, started_at, notes)
       VALUES ($1,$2,'active',NOW(),$3) RETURNING *`,
      [req.user.group_id, newNum, notes || null]
    )
    res.status(201).json(rows[0])
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

// PUT /api/mgr/cycles/:id/close
router.put('/cycles/:id/close', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE mgr_cycles SET status='completed', completed_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND group_id=$2 RETURNING *`,
      [req.params.id, req.user.group_id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Cycle not found' })
    res.json(rows[0])
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

// ─── MGR Schedule (existing, cycle-aware) ─────────────────────

// GET /api/mgr/schedule
router.get('/schedule', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT s.*, c.cycle_number,
              m1.name AS member1_name, m2.name AS member2_name
       FROM mgr_schedule s
       LEFT JOIN mgr_cycles c ON c.id = s.cycle_id
       LEFT JOIN members m1 ON m1.id = s.member1_id
       LEFT JOIN members m2 ON m2.id = s.member2_id
       WHERE s.group_id = $1
       ORDER BY c.cycle_number DESC, s.month_index ASC`,
      [req.user.group_id]
    )
    res.json(rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

// ─── MGR Agreements (T&C signing) ─────────────────────────────

// GET /api/mgr/agreement  — current user's agreement for active cycle
router.get('/agreement', authenticate, async (req, res) => {
  try {
    const { rows: cycle } = await query(
      `SELECT id FROM mgr_cycles WHERE group_id=$1 AND status='active' LIMIT 1`,
      [req.user.group_id]
    )
    if (!cycle[0]) return res.json(null)
    const { rows } = await query(
      `SELECT * FROM mgr_agreements WHERE user_id=$1 AND group_id=$2 AND cycle_id=$3`,
      [req.user.id, req.user.group_id, cycle[0].id]
    )
    res.json(rows[0] || null)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

// POST /api/mgr/agreement  — sign T&C
router.post('/agreement', authenticate, async (req, res) => {
  const { platform_terms, group_terms, financial_acknowledged, digital_signature } = req.body
  if (!platform_terms || !group_terms || !financial_acknowledged || !digital_signature) {
    return res.status(400).json({ error: 'All four agreement fields required' })
  }
  try {
    const { rows: cycle } = await query(
      `SELECT id FROM mgr_cycles WHERE group_id=$1 AND status='active' LIMIT 1`,
      [req.user.group_id]
    )
    if (!cycle[0]) return res.status(400).json({ error: 'No active cycle' })
    const { rows } = await query(
      `INSERT INTO mgr_agreements
         (user_id, group_id, cycle_id, platform_terms, group_terms, financial_acknowledged, digital_signature, agreed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (user_id, group_id)
       DO UPDATE SET platform_terms=$4, group_terms=$5, financial_acknowledged=$6,
                     digital_signature=$7, agreed_at=NOW(), cycle_id=$3
       RETURNING *`,
      [req.user.id, req.user.group_id, cycle[0].id,
       platform_terms, group_terms, financial_acknowledged, digital_signature]
    )
    res.status(201).json(rows[0])
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

module.exports = router
