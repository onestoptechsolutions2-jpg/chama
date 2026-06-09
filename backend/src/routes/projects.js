const router = require('express').Router()
const { query } = require('../config/database')
const { authenticate, authorize } = require('../middleware/auth')

// GET /api/projects
router.get('/', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.*,
              COUNT(pc.id) AS contributor_count,
              SUM(pc.amount) AS total_raised
       FROM projects p
       LEFT JOIN project_contributions pc ON pc.project_id = p.id
       WHERE p.group_id = $1
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [req.user.group_id]
    )
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/projects
router.post('/', authenticate, authorize('admin', 'treasurer'), async (req, res) => {
  const { name, description, target_amount = 0, start_date, end_date } = req.body
  if (!name) return res.status(400).json({ error: 'name required' })
  try {
    const { rows } = await query(
      `INSERT INTO projects (group_id, name, description, target_amount, start_date, end_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.group_id, name, description || null, target_amount,
       start_date || null, end_date || null, req.user.id]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// PUT /api/projects/:id
router.put('/:id', authenticate, authorize('admin', 'treasurer'), async (req, res) => {
  const { name, description, target_amount, status, start_date, end_date } = req.body
  try {
    const { rows } = await query(
      `UPDATE projects SET
         name          = COALESCE($1, name),
         description   = COALESCE($2, description),
         target_amount = COALESCE($3, target_amount),
         status        = COALESCE($4, status),
         start_date    = COALESCE($5, start_date),
         end_date      = COALESCE($6, end_date),
         updated_at    = NOW()
       WHERE id = $7 AND group_id = $8 RETURNING *`,
      [name, description, target_amount, status, start_date, end_date,
       req.params.id, req.user.group_id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/projects/:id/contributions
router.get('/:id/contributions', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT pc.*, m.name AS member_name
       FROM project_contributions pc
       JOIN members m ON m.id = pc.member_id
       WHERE pc.project_id = $1
       ORDER BY pc.created_at DESC`,
      [req.params.id]
    )
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/projects/:id/contributions
router.post('/:id/contributions', authenticate, authorize('admin', 'treasurer'), async (req, res) => {
  const { member_id, amount, reference, notes } = req.body
  if (!member_id || !amount) return res.status(400).json({ error: 'member_id and amount required' })
  const client = await require('../config/database').pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `INSERT INTO project_contributions (project_id, member_id, amount, reference, notes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, member_id, amount, reference || null, notes || null]
    )
    await client.query(
      'UPDATE projects SET collected_amount = collected_amount + $1, updated_at = NOW() WHERE id = $2',
      [amount, req.params.id]
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

module.exports = router
