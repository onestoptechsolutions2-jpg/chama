const router  = require('express').Router()
const bcrypt  = require('bcryptjs')
const { query } = require('../config/database')

// Super-admin middleware — secret header gate
function superAuth(req, res, next) {
  const secret = process.env.SUPER_ADMIN_SECRET || ''
  if (!secret || req.headers['x-super-secret'] !== secret) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  next()
}

// GET /api/super-admin/groups  — list all groups
router.get('/groups', superAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT g.*, COUNT(gm.id) AS member_count
       FROM groups g
       LEFT JOIN group_memberships gm ON gm.group_id = g.id AND gm.status = 'active'
       GROUP BY g.id ORDER BY g.created_at DESC`
    )
    res.json(rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

// POST /api/super-admin/groups  — create new group + admin user
router.post('/groups', superAuth, async (req, res) => {
  const {
    group_name, group_type = 'chama', description,
    admin_name, admin_email, admin_phone, admin_password,
    is_public = true, require_approval = true,
  } = req.body
  if (!group_name || !admin_name || !admin_password) {
    return res.status(400).json({ error: 'group_name, admin_name, admin_password required' })
  }
  if (!admin_email && !admin_phone) {
    return res.status(400).json({ error: 'admin_email or admin_phone required' })
  }

  const client = await require('../config/database').pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: g } = await client.query(
      `INSERT INTO groups (name, type, description, founded_date, is_public, require_approval)
       VALUES ($1,$2,$3,CURRENT_DATE,$4,$5) RETURNING id`,
      [group_name, group_type, description || null, is_public, require_approval]
    )
    const groupId = g[0].id

    const hash = await bcrypt.hash(admin_password, 10)
    const { rows: u } = await client.query(
      `INSERT INTO users (name, email, phone, password_hash, role, group_id, active)
       VALUES ($1,$2,$3,$4,'admin',$5,TRUE)
       ON CONFLICT (email) DO UPDATE SET group_id=$5, role='admin' RETURNING id`,
      [admin_name, admin_email || null, admin_phone || null, hash, groupId]
    )
    const adminId = u[0].id

    await client.query(
      `INSERT INTO group_memberships (user_id, group_id, role, status)
       VALUES ($1,$2,'admin','active') ON CONFLICT (user_id, group_id) DO NOTHING`,
      [adminId, groupId]
    )

    // Seed first MGR cycle
    await client.query(
      `INSERT INTO mgr_cycles (group_id, cycle_number, status) VALUES ($1, 1, 'active')`,
      [groupId]
    )

    await client.query('COMMIT')
    res.status(201).json({
      group_id: groupId,
      admin_id: adminId,
      message: `Group "${group_name}" created with admin ${admin_email || admin_phone}`,
    })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error(err)
    res.status(500).json({ error: 'Server error: ' + err.message })
  } finally {
    client.release()
  }
})

// GET /api/super-admin/stats
router.get('/stats', superAuth, async (req, res) => {
  try {
    const [groups, users, members] = await Promise.all([
      query('SELECT COUNT(*) AS n FROM groups').then(r => r.rows[0].n),
      query('SELECT COUNT(*) AS n FROM users WHERE active=TRUE').then(r => r.rows[0].n),
      query('SELECT COUNT(*) AS n FROM group_memberships WHERE status=\'active\'').then(r => r.rows[0].n),
    ])
    res.json({ groups, users, active_memberships: members })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

module.exports = router
