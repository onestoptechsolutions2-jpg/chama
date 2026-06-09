const router = require('express').Router()
const { query } = require('../config/database')
const { authenticate, authorize } = require('../middleware/auth')

// GET /api/groups  — public listing (no auth needed)
router.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT g.id, g.name, g.type, g.description, g.founded_date,
              g.is_public, g.require_approval, g.max_members,
              COUNT(gm.id) AS member_count
       FROM groups g
       LEFT JOIN group_memberships gm ON gm.group_id = g.id AND gm.status = 'active'
       WHERE g.is_public = TRUE
       GROUP BY g.id
       ORDER BY g.created_at DESC`
    )
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/groups/:id  — public group detail
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT g.id, g.name, g.type, g.description, g.founded_date,
              g.is_public, g.require_approval, g.max_members,
              g.share_price, g.shares_per_member, g.contribution_day,
              g.mgr_terms, g.platform_terms,
              COUNT(gm.id) AS member_count
       FROM groups g
       LEFT JOIN group_memberships gm ON gm.group_id = g.id AND gm.status = 'active'
       WHERE g.id = $1 AND g.is_public = TRUE
       GROUP BY g.id`,
      [req.params.id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Group not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/groups/:id/join  — request to join (auth required)
router.post('/:id/join', authenticate, async (req, res) => {
  const groupId = parseInt(req.params.id, 10)
  const { message } = req.body
  try {
    const { rows: grp } = await query('SELECT * FROM groups WHERE id = $1 AND is_public = TRUE', [groupId])
    if (!grp[0]) return res.status(404).json({ error: 'Group not found' })

    // Check already a member / pending
    const { rows: existing } = await query(
      'SELECT id, status FROM group_memberships WHERE user_id = $1 AND group_id = $2',
      [req.user.id, groupId]
    )
    if (existing[0]) {
      return res.status(409).json({ error: `Already ${existing[0].status} in this group` })
    }

    const status = grp[0].require_approval ? 'pending' : 'active'
    await query(
      `INSERT INTO group_memberships (user_id, group_id, role, status, join_message)
       VALUES ($1,$2,'member',$3,$4)`,
      [req.user.id, groupId, status, message || null]
    )
    res.status(201).json({ status, message: status === 'active' ? 'Joined!' : 'Request sent — awaiting admin approval' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/groups/:id/pending  — pending join requests (admin)
router.get('/:id/pending', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT gm.id, gm.user_id, gm.join_message, gm.created_at,
              u.name, u.email, u.phone
       FROM group_memberships gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = $1 AND gm.status = 'pending'
       ORDER BY gm.created_at ASC`,
      [req.user.group_id]
    )
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// PUT /api/groups/:id/members/:membershipId  — approve / reject
router.put('/:id/members/:membershipId', authenticate, authorize('admin'), async (req, res) => {
  const { action } = req.body // 'approve' | 'reject'
  if (!['approve','reject'].includes(action)) return res.status(400).json({ error: 'action must be approve or reject' })

  try {
    const newStatus = action === 'approve' ? 'active' : 'rejected'
    const { rows } = await query(
      `UPDATE group_memberships
       SET status = $1, reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $3 AND group_id = $4 RETURNING *`,
      [newStatus, req.user.id, req.params.membershipId, req.user.group_id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Membership not found' })

    // If approved, also create a members record
    if (action === 'approve') {
      const gm = rows[0]
      const { rows: u } = await query('SELECT name, email, phone FROM users WHERE id = $1', [gm.user_id])
      if (u[0]) {
        await query(
          `INSERT INTO members (group_id, user_id, name, email, phone, joined_date)
           VALUES ($1,$2,$3,$4,$5,CURRENT_DATE) ON CONFLICT DO NOTHING`,
          [req.user.group_id, gm.user_id, u[0].name, u[0].email || null, u[0].phone || null]
        )
      }
    }
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
