const router = require('express').Router()
const { query } = require('../config/database')
const { authenticate, authorize } = require('../middleware/auth')

// GET /api/rules?category=&active=true
router.get('/', authenticate, async (req, res) => {
  const { category, active } = req.query
  const filters = ['r.group_id = $1']
  const vals    = [req.user.group_id]
  let i = 2
  if (category)       { filters.push(`r.category = $${i++}`);    vals.push(category) }
  if (active !== undefined) { filters.push(`r.active = $${i++}`); vals.push(active !== 'false') }

  try {
    const { rows } = await query(
      `SELECT * FROM rules r WHERE ${filters.join(' AND ')} ORDER BY r.rule_number ASC`,
      vals
    )
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/rules
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  const {
    rule_number, category = 'general', title, description,
    penalty_amount, applies_to = 'all', effective_date,
  } = req.body
  if (!description) return res.status(400).json({ error: 'description required' })

  try {
    // Auto-number if not provided
    let num = rule_number
    if (!num) {
      const { rows } = await query(
        'SELECT COUNT(*) AS cnt FROM rules WHERE group_id = $1', [req.user.group_id]
      )
      num = String(parseInt(rows[0].cnt) + 1).padStart(2, '0')
    }

    const { rows } = await query(
      `INSERT INTO rules (group_id, rule_number, category, title, description, penalty_amount, applies_to, effective_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.group_id, num, category, title || null, description,
       penalty_amount || null, applies_to, effective_date || null]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// PUT /api/rules/:id
router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  const { rule_number, category, title, description, penalty_amount, applies_to, effective_date, active } = req.body
  try {
    const { rows } = await query(
      `UPDATE rules SET
         rule_number    = COALESCE($1, rule_number),
         category       = COALESCE($2, category),
         title          = COALESCE($3, title),
         description    = COALESCE($4, description),
         penalty_amount = COALESCE($5, penalty_amount),
         applies_to     = COALESCE($6, applies_to),
         effective_date = COALESCE($7, effective_date),
         active         = COALESCE($8, active),
         updated_at     = NOW()
       WHERE id = $9 AND group_id = $10 RETURNING *`,
      [rule_number, category, title, description, penalty_amount, applies_to, effective_date, active,
       req.params.id, req.user.group_id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// DELETE /api/rules/:id  — soft delete
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    await query(
      'UPDATE rules SET active = FALSE, updated_at = NOW() WHERE id = $1 AND group_id = $2',
      [req.params.id, req.user.group_id]
    )
    res.json({ message: 'Rule deactivated' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
