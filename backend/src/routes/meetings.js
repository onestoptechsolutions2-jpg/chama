const router = require('express').Router()
const { query } = require('../config/database')
const { authenticate, authorize } = require('../middleware/auth')

// GET /api/meetings
router.get('/', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT m.*, COUNT(a.id) AS attendee_count
       FROM meetings m
       LEFT JOIN attendance a ON a.meeting_id = m.id AND a.status = 'present'
       WHERE m.group_id = $1
       GROUP BY m.id
       ORDER BY m.meeting_date DESC`,
      [req.user.group_id]
    )
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/meetings
router.post('/', authenticate, authorize('admin', 'secretary', 'treasurer'), async (req, res) => {
  const { meeting_date, meeting_type = 'regular', venue, agenda, chaired_by } = req.body
  if (!meeting_date) return res.status(400).json({ error: 'meeting_date required' })
  try {
    const { rows } = await query(
      `INSERT INTO meetings (group_id, meeting_date, meeting_type, venue, agenda, chaired_by, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.user.group_id, meeting_date, meeting_type, venue || null,
       agenda || null, chaired_by || null, req.user.id]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// PUT /api/meetings/:id
router.put('/:id', authenticate, authorize('admin', 'secretary', 'treasurer'), async (req, res) => {
  const { meeting_date, meeting_type, venue, agenda, minutes, quorum_met, chaired_by } = req.body
  try {
    const { rows } = await query(
      `UPDATE meetings SET
         meeting_date = COALESCE($1, meeting_date),
         meeting_type = COALESCE($2, meeting_type),
         venue        = COALESCE($3, venue),
         agenda       = COALESCE($4, agenda),
         minutes      = COALESCE($5, minutes),
         quorum_met   = COALESCE($6, quorum_met),
         chaired_by   = COALESCE($7, chaired_by),
         updated_at   = NOW()
       WHERE id = $8 AND group_id = $9 RETURNING *`,
      [meeting_date, meeting_type, venue, agenda, minutes, quorum_met, chaired_by,
       req.params.id, req.user.group_id]
    )
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    res.json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── Attendance ────────────────────────────────────────────────
// GET /api/meetings/:id/attendance
router.get('/:id/attendance', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT a.*, m.name AS member_name
       FROM attendance a
       JOIN members m ON m.id = a.member_id
       WHERE a.meeting_id = $1
       ORDER BY m.name`,
      [req.params.id]
    )
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/meetings/:id/attendance  — bulk upsert
router.post('/:id/attendance', authenticate, authorize('admin', 'secretary', 'treasurer'), async (req, res) => {
  // body: { records: [{ member_id, status, notes }] }
  const { records } = req.body
  if (!Array.isArray(records) || !records.length)
    return res.status(400).json({ error: 'records array required' })

  const client = await require('../config/database').pool.connect()
  try {
    await client.query('BEGIN')

    // Auto-generate fines for absent/late
    const { rows: [grp] } = await client.query(
      'SELECT type FROM groups WHERE id = $1', [req.user.group_id]
    )

    const FINE_ABSENT = 100
    const FINE_LATE   = 50

    for (const r of records) {
      await client.query(
        `INSERT INTO attendance (meeting_id, member_id, status, notes, fine_issued)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (meeting_id, member_id)
         DO UPDATE SET status = $3, notes = $4, fine_issued = $5`,
        [req.params.id, r.member_id, r.status, r.notes || null,
         ['absent','late'].includes(r.status)]
      )

      // Create fine automatically
      if (r.status === 'absent' || r.status === 'late') {
        const fineAmt = r.status === 'absent' ? FINE_ABSENT : FINE_LATE
        await client.query(
          `INSERT INTO fines (group_id, member_id, type, amount, reason, recorded_by)
           VALUES ($1,$2,'${r.status}',${fineAmt},'Auto: meeting ${req.params.id}',$3)`,
          [req.user.group_id, r.member_id, req.user.id]
        )
        await client.query(
          'UPDATE members SET total_fines = total_fines + $1, updated_at = NOW() WHERE id = $2',
          [fineAmt, r.member_id]
        )
      }
    }

    await client.query('COMMIT')
    res.json({ message: 'Attendance recorded' })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  } finally {
    client.release()
  }
})

module.exports = router
