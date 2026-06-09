const router  = require('express').Router()
const { pool } = require('../config/database')
const auth     = require('../middleware/auth')

router.use(auth)

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Advance a date by one cycle unit */
function nextCycleDate(date, frequency) {
  const d = new Date(date)
  if (frequency === 'weekly')        d.setDate(d.getDate() + 7)
  else if (frequency === 'biweekly') d.setDate(d.getDate() + 14)
  else                               d.setMonth(d.getMonth() + 1)
  return d
}

/** Format Date → 'YYYY-MM-DD' */
function toDateStr(d) {
  return new Date(d).toISOString().split('T')[0]
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/mgr/config */
router.get('/config', async (req, res) => {
  try {
    const gid = req.user.group_id
    const { rows } = await pool.query(`
      SELECT mgr_frequency, mgr_cycle_day, mgr_recipients_per_cycle,
             mgr_start_date, mgr_contribution_amount, share_price
      FROM groups WHERE id = $1
    `, [gid])
    if (!rows[0]) return res.status(404).json({ error: 'Group not found' })
    res.json(rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

/** PUT /api/mgr/config  (admin only) */
router.put('/config', async (req, res) => {
  if (!['admin','treasurer'].includes(req.user.role))
    return res.status(403).json({ error: 'Admin only' })
  try {
    const gid = req.user.group_id
    const {
      mgr_frequency = 'monthly',
      mgr_cycle_day = 1,
      mgr_recipients_per_cycle = 1,
      mgr_start_date,
      mgr_contribution_amount,
    } = req.body
    await pool.query(`
      UPDATE groups SET
        mgr_frequency             = $1,
        mgr_cycle_day             = $2,
        mgr_recipients_per_cycle  = $3,
        mgr_start_date            = $4,
        mgr_contribution_amount   = $5
      WHERE id = $6
    `, [mgr_frequency, mgr_cycle_day, mgr_recipients_per_cycle,
        mgr_start_date || null, mgr_contribution_amount || null, gid])
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ─────────────────────────────────────────────────────────────────────────────
// MEMBER TURNS
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/mgr/turns */
router.get('/turns', async (req, res) => {
  try {
    const gid = req.user.group_id
    const { rows } = await pool.query(`
      SELECT mmt.id, mmt.member_id, mmt.turns_total,
             mmt.contribution_multiplier, mmt.status,
             m.name, m.member_id AS member_code
      FROM mgr_member_turns mmt
      JOIN members m ON m.id = mmt.member_id
      WHERE mmt.group_id = $1
      ORDER BY m.joined_date ASC, m.id ASC
    `, [gid])
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

/**
 * POST /api/mgr/turns
 * Set or update a member's turn count.
 * Multi-turn = contribution_multiplier auto-set to turns_total (pays N× per cycle).
 */
router.post('/turns', async (req, res) => {
  try {
    const gid = req.user.group_id
    const { member_id, turns_total = 1 } = req.body
    if (!member_id || turns_total < 1)
      return res.status(400).json({ error: 'member_id and turns_total >= 1 required' })

    // Non-admin can only update their own turns
    if (!['admin','treasurer'].includes(req.user.role)) {
      const { rows: self } = await pool.query(
        'SELECT id FROM members WHERE user_id = $1 AND group_id = $2', [req.user.id, gid]
      )
      if (!self[0] || self[0].id !== parseInt(member_id))
        return res.status(403).json({ error: 'Can only update your own turns' })
    }

    const { rows } = await pool.query(`
      INSERT INTO mgr_member_turns (group_id, member_id, turns_total, contribution_multiplier)
      VALUES ($1, $2, $3, $3)
      ON CONFLICT (group_id, member_id) DO UPDATE SET
        turns_total             = EXCLUDED.turns_total,
        contribution_multiplier = EXCLUDED.turns_total,
        updated_at              = NOW()
      RETURNING *
    `, [gid, member_id, turns_total])
    res.json(rows[0])
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULE GENERATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/mgr/generate  (admin)
 * Rebuilds the full schedule from config + member turns.
 * Preserves already-claimed/paid slots.
 */
router.post('/generate', async (req, res) => {
  if (!['admin','treasurer'].includes(req.user.role))
    return res.status(403).json({ error: 'Admin only' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const gid = req.user.group_id

    const { rows: [grp] } = await client.query(`
      SELECT mgr_frequency, mgr_cycle_day, mgr_recipients_per_cycle,
             mgr_start_date, mgr_contribution_amount, share_price
      FROM groups WHERE id = $1
    `, [gid])

    const frequency          = grp.mgr_frequency || 'monthly'
    const recipientsPerCycle = parseInt(grp.mgr_recipients_per_cycle) || 1
    const baseContrib        = parseFloat(grp.mgr_contribution_amount || grp.share_price || 0)
    const startDate          = grp.mgr_start_date ? new Date(grp.mgr_start_date) : new Date()

    // All active members with their turn counts (default 1)
    const { rows: allMembers } = await client.query(`
      SELECT m.id AS member_id, m.name,
             COALESCE(mmt.turns_total, 1)             AS turns_total,
             COALESCE(mmt.contribution_multiplier, 1) AS multiplier
      FROM members m
      LEFT JOIN mgr_member_turns mmt
             ON mmt.member_id = m.id AND mmt.group_id = $1
      WHERE m.group_id = $1 AND m.status = 'active'
      ORDER BY m.joined_date ASC, m.id ASC
    `, [gid])

    if (allMembers.length === 0) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'No active members found' })
    }

    // Ensure turn records exist for all members
    for (const m of allMembers) {
      await client.query(`
        INSERT INTO mgr_member_turns (group_id, member_id, turns_total, contribution_multiplier)
        VALUES ($1, $2, $3, $3)
        ON CONFLICT (group_id, member_id) DO NOTHING
      `, [gid, m.member_id, m.turns_total])
    }

    // ── Derived values ──
    const totalSlots      = allMembers.reduce((s, m) => s + parseInt(m.turns_total), 0)
    const totalCycles     = Math.ceil(totalSlots / recipientsPerCycle)
    const contribPerCycle = allMembers.reduce(
      (s, m) => s + parseFloat(m.multiplier) * baseContrib, 0
    )
    const payoutPerSlot   = recipientsPerCycle > 0
      ? contribPerCycle / recipientsPerCycle
      : contribPerCycle

    // Remove future open slots & their unstarted cycles
    await client.query(`
      DELETE FROM mgr_slots
      WHERE group_id = $1 AND status = 'open'
    `, [gid])
    await client.query(`
      DELETE FROM mgr_cycles
      WHERE group_id = $1
        AND status IN ('planned')
        AND id NOT IN (
          SELECT DISTINCT cycle_id FROM mgr_slots
          WHERE group_id = $1 AND cycle_id IS NOT NULL
        )
    `, [gid])

    // ── Create cycles + slots ──
    let date       = new Date(startDate)
    let globalSlot = 1

    for (let cycleNum = 1; cycleNum <= totalCycles; cycleNum++) {
      const cycleDate = toDateStr(date)

      const { rows: [cyc] } = await client.query(`
        INSERT INTO mgr_cycles
          (group_id, cycle_number, status, scheduled_date,
           slot_count, payout_per_slot, total_contributions)
        VALUES ($1, $2, 'planned', $3, $4, $5, $6)
        ON CONFLICT (group_id, cycle_number) DO UPDATE SET
          scheduled_date      = EXCLUDED.scheduled_date,
          slot_count          = EXCLUDED.slot_count,
          payout_per_slot     = EXCLUDED.payout_per_slot,
          total_contributions = EXCLUDED.total_contributions
        RETURNING id
      `, [gid, cycleNum, cycleDate, recipientsPerCycle, payoutPerSlot, contribPerCycle])

      const cycleId = cyc.id

      for (let slotNum = 1; slotNum <= recipientsPerCycle; slotNum++) {
        if (globalSlot > totalSlots) break
        await client.query(`
          INSERT INTO mgr_slots
            (group_id, cycle_id, cycle_number, slot_number,
             status, payout_amount, scheduled_date)
          VALUES ($1, $2, $3, $4, 'open', $5, $6)
          ON CONFLICT (group_id, cycle_number, slot_number) DO UPDATE SET
            cycle_id       = EXCLUDED.cycle_id,
            payout_amount  = EXCLUDED.payout_amount,
            scheduled_date = EXCLUDED.scheduled_date
        `, [gid, cycleId, cycleNum, slotNum, payoutPerSlot, cycleDate])
        globalSlot++
      }

      date = nextCycleDate(date, frequency)
    }

    await client.query('COMMIT')
    res.json({
      ok: true,
      total_members:        allMembers.length,
      total_slots:          totalSlots,
      total_cycles:         totalCycles,
      recipients_per_cycle: recipientsPerCycle,
      payout_per_slot:      payoutPerSlot,
      contrib_per_cycle:    contribPerCycle,
      frequency,
      start_date:           toDateStr(startDate),
    })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULE VIEW
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/mgr/schedule */
router.get('/schedule', async (req, res) => {
  try {
    const gid = req.user.group_id

    const { rows: [config] } = await pool.query(`
      SELECT mgr_frequency, mgr_cycle_day, mgr_recipients_per_cycle,
             mgr_start_date, mgr_contribution_amount, share_price
      FROM groups WHERE id = $1
    `, [gid])

    const { rows: cycles } = await pool.query(`
      SELECT id, cycle_number, status, scheduled_date,
             slot_count, payout_per_slot, total_contributions
      FROM mgr_cycles WHERE group_id = $1
      ORDER BY cycle_number ASC
    `, [gid])

    const { rows: slots } = await pool.query(`
      SELECT s.id, s.cycle_number, s.slot_number, s.status,
             s.payout_amount, s.scheduled_date, s.claimed_at, s.paid_at,
             s.member_id, m.name AS member_name, m.member_id AS member_code
      FROM mgr_slots s
      LEFT JOIN members m ON m.id = s.member_id
      WHERE s.group_id = $1
      ORDER BY s.cycle_number ASC, s.slot_number ASC
    `, [gid])

    const { rows: turns } = await pool.query(`
      SELECT mmt.member_id, mmt.turns_total, mmt.contribution_multiplier, mmt.status,
             m.name, m.member_id AS member_code,
             COUNT(s.id) FILTER (WHERE s.status IN ('claimed','auto_assigned','paid'))
               AS slots_taken
      FROM mgr_member_turns mmt
      JOIN members m ON m.id = mmt.member_id
      LEFT JOIN mgr_slots s ON s.member_id = mmt.member_id AND s.group_id = $1
      WHERE mmt.group_id = $1
      GROUP BY mmt.member_id, mmt.turns_total, mmt.contribution_multiplier,
               mmt.status, m.name, m.member_id
      ORDER BY m.joined_date ASC, m.id ASC
    `, [gid])

    // Attach slots to their cycle
    const slotsByCycle = {}
    for (const s of slots) {
      if (!slotsByCycle[s.cycle_number]) slotsByCycle[s.cycle_number] = []
      slotsByCycle[s.cycle_number].push(s)
    }
    const cyclesWithSlots = cycles.map(c => ({
      ...c,
      slots: slotsByCycle[c.cycle_number] || [],
    }))

    res.json({ config, cycles: cyclesWithSlots, turns })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ─────────────────────────────────────────────────────────────────────────────
// SLOT CLAIMING
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/mgr/slots/:id/claim */
router.post('/slots/:id/claim', async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const gid    = req.user.group_id
    const slotId = parseInt(req.params.id)

    const { rows: [me] } = await client.query(
      'SELECT id FROM members WHERE user_id = $1 AND group_id = $2', [req.user.id, gid]
    )
    if (!me) {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: 'Not a member of this group' })
    }
    const memberId = me.id

    const { rows: [slot] } = await client.query(
      'SELECT * FROM mgr_slots WHERE id = $1 AND group_id = $2 FOR UPDATE', [slotId, gid]
    )
    if (!slot) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Slot not found' })
    }
    if (slot.status !== 'open') {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: `Slot is already ${slot.status}` })
    }

    // Check remaining turns
    const { rows: [turns] } = await client.query(
      'SELECT turns_total FROM mgr_member_turns WHERE group_id=$1 AND member_id=$2', [gid, memberId]
    )
    const maxTurns = parseInt(turns?.turns_total || 1)
    const { rows: [{ taken }] } = await client.query(`
      SELECT COUNT(*) AS taken FROM mgr_slots
      WHERE group_id = $1 AND member_id = $2
        AND status IN ('claimed','auto_assigned','paid')
    `, [gid, memberId])

    if (parseInt(taken) >= maxTurns) {
      await client.query('ROLLBACK')
      return res.status(409).json({
        error: `You have used all ${maxTurns} of your turns`
      })
    }

    const { rows: [updated] } = await client.query(`
      UPDATE mgr_slots SET member_id=$1, status='claimed', claimed_at=NOW()
      WHERE id=$2 RETURNING *
    `, [memberId, slotId])

    await client.query('COMMIT')
    res.json(updated)
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

/** PUT /api/mgr/slots/:id  (admin: assign / mark-paid / skip) */
router.put('/slots/:id', async (req, res) => {
  if (!['admin','treasurer'].includes(req.user.role))
    return res.status(403).json({ error: 'Admin only' })
  try {
    const gid    = req.user.group_id
    const slotId = parseInt(req.params.id)
    const { member_id, status } = req.body

    const valid = ['open','claimed','auto_assigned','paid','skipped']
    if (status && !valid.includes(status))
      return res.status(400).json({ error: 'Invalid status' })

    const fields = []; const vals = []; let i = 1
    if (member_id !== undefined) { fields.push(`member_id = $${i++}`); vals.push(member_id || null) }
    if (status !== undefined) {
      fields.push(`status = $${i++}`); vals.push(status)
      if (status === 'paid') { fields.push(`paid_at = $${i++}`); vals.push(new Date()) }
    }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' })

    vals.push(slotId, gid)
    const { rows: [slot] } = await pool.query(
      `UPDATE mgr_slots SET ${fields.join(', ')} WHERE id=$${i} AND group_id=$${i+1} RETURNING *`,
      vals
    )
    if (!slot) return res.status(404).json({ error: 'Slot not found' })
    res.json(slot)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

/**
 * POST /api/mgr/auto-assign
 * Fill remaining open slots in round-robin queue order.
 */
router.post('/auto-assign', async (req, res) => {
  if (!['admin','treasurer'].includes(req.user.role))
    return res.status(403).json({ error: 'Admin only' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const gid = req.user.group_id

    const { rows: openSlots } = await client.query(`
      SELECT * FROM mgr_slots WHERE group_id=$1 AND status='open'
      ORDER BY cycle_number ASC, slot_number ASC
    `, [gid])

    if (!openSlots.length) {
      await client.query('ROLLBACK')
      return res.json({ ok: true, assigned: 0 })
    }

    const { rows: allTurns } = await client.query(`
      SELECT mmt.member_id, mmt.turns_total,
             COUNT(s.id) FILTER (WHERE s.status IN ('claimed','auto_assigned','paid')) AS taken
      FROM mgr_member_turns mmt
      LEFT JOIN mgr_slots s ON s.member_id=mmt.member_id AND s.group_id=$1
      WHERE mmt.group_id=$1 AND mmt.status='active'
      GROUP BY mmt.member_id, mmt.turns_total
      ORDER BY mmt.member_id ASC
    `, [gid])

    const maxRounds = Math.max(...allTurns.map(t => parseInt(t.turns_total)), 0)
    const queue = []
    for (let round = 1; round <= maxRounds; round++) {
      for (const t of allTurns) {
        if (parseInt(t.taken) < round && parseInt(t.turns_total) >= round)
          queue.push(t.member_id)
      }
    }

    let assigned = 0
    for (const slot of openSlots) {
      if (!queue.length) break
      await client.query(`
        UPDATE mgr_slots SET member_id=$1, status='auto_assigned', claimed_at=NOW()
        WHERE id=$2
      `, [queue.shift(), slot.id])
      assigned++
    }

    await client.query('COMMIT')
    res.json({ ok: true, assigned })
  } catch (err) {
    await client.query('ROLLBACK')
    res.status(500).json({ error: err.message })
  } finally {
    client.release()
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// CYCLES (listing / manual add)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/cycles', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.*,
             COUNT(s.id) FILTER (WHERE s.status='paid')         AS paid_slots,
             COUNT(s.id) FILTER (WHERE s.status NOT IN ('open','skipped')) AS filled_slots,
             COUNT(s.id)                                         AS total_slots
      FROM mgr_cycles c
      LEFT JOIN mgr_slots s ON s.cycle_id=c.id
      WHERE c.group_id=$1
      GROUP BY c.id
      ORDER BY c.cycle_number ASC
    `, [req.user.group_id])
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/cycles', async (req, res) => {
  if (!['admin','treasurer'].includes(req.user.role))
    return res.status(403).json({ error: 'Admin only' })
  try {
    const gid = req.user.group_id
    const { rows: [last] } = await pool.query(
      'SELECT COALESCE(MAX(cycle_number),0) AS n FROM mgr_cycles WHERE group_id=$1', [gid]
    )
    const { rows: [cyc] } = await pool.query(
      `INSERT INTO mgr_cycles (group_id, cycle_number, status, scheduled_date)
       VALUES ($1,$2,'planned',$3) RETURNING *`,
      [gid, parseInt(last.n)+1, req.body.scheduled_date || null]
    )
    res.json(cyc)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.put('/cycles/:id/close', async (req, res) => {
  if (!['admin','treasurer'].includes(req.user.role))
    return res.status(403).json({ error: 'Admin only' })
  try {
    const { rows: [cyc] } = await pool.query(
      `UPDATE mgr_cycles SET status='completed', end_date=CURRENT_DATE
       WHERE id=$1 AND group_id=$2 RETURNING *`,
      [req.params.id, req.user.group_id]
    )
    if (!cyc) return res.status(404).json({ error: 'Cycle not found' })
    res.json(cyc)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ─────────────────────────────────────────────────────────────────────────────
// T&C AGREEMENT
// ─────────────────────────────────────────────────────────────────────────────

router.get('/agreement', async (req, res) => {
  try {
    const gid = req.user.group_id
    const { rows: [cycle] } = await pool.query(
      `SELECT id FROM mgr_cycles WHERE group_id=$1 AND status='active'
       ORDER BY cycle_number LIMIT 1`, [gid]
    )
    if (!cycle) return res.json(null)
    const { rows: [agr] } = await pool.query(
      `SELECT * FROM mgr_agreements WHERE cycle_id=$1 AND user_id=$2 LIMIT 1`,
      [cycle.id, req.user.id]
    )
    res.json(agr || null)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/agreement', async (req, res) => {
  try {
    const gid = req.user.group_id
    const { platform_terms, group_terms, financial_acknowledged, digital_signature } = req.body
    if (!platform_terms || !group_terms || !financial_acknowledged || !digital_signature)
      return res.status(400).json({ error: 'All 4 agreement fields required' })

    const { rows: [cycle] } = await pool.query(
      `SELECT id FROM mgr_cycles WHERE group_id=$1 AND status='active'
       ORDER BY cycle_number LIMIT 1`, [gid]
    )
    if (!cycle) return res.status(404).json({ error: 'No active cycle' })

    const { rows: [agr] } = await pool.query(`
      INSERT INTO mgr_agreements
        (cycle_id, user_id, platform_terms, group_terms, financial_acknowledged, digital_signature)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (cycle_id, user_id) DO UPDATE SET
        platform_terms=EXCLUDED.platform_terms,
        group_terms=EXCLUDED.group_terms,
        financial_acknowledged=EXCLUDED.financial_acknowledged,
        digital_signature=EXCLUDED.digital_signature,
        signed_at=NOW()
      RETURNING *
    `, [cycle.id, req.user.id, platform_terms, group_terms, financial_acknowledged, digital_signature])
    res.json(agr)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

module.exports = router
