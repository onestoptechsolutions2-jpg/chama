/**
 * Enforcement cron jobs
 *
 * 1. Contribution grace-period checker  — runs daily at 08:00
 *    For each group: find members whose contribution was due > grace_days ago
 *    and haven't paid. Auto-fine them once per period.
 *
 * 2. Loan overdue checker  — runs daily at 08:15
 *    Find active/extended loans past due_date. Flag as overdue, add penalty.
 */

const cron = require('node-cron')
const { pool } = require('../config/database')

const DEFAULT_GRACE_DAYS   = 5    // days after due before fine fires
const DEFAULT_LOAN_PENALTY = 500  // Ksh penalty per overdue check

// ── Helper ────────────────────────────────────────────────────────────────────
async function withClient(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await fn(client)
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[enforcement]', err.message)
  } finally {
    client.release()
  }
}

// ── 1. Contribution grace-period checker ─────────────────────────────────────
async function checkContributionDues() {
  console.log('[enforcement] Running contribution due check...')
  try {
    // Find all overdue dues that haven't been fined yet
    const { rows: overdue } = await pool.query(`
      SELECT cd.*, g.fine_absence AS fine_amount, g.id AS group_id
      FROM contribution_dues cd
      JOIN groups g ON g.id = cd.group_id
      WHERE cd.status = 'pending'
        AND cd.due_date + INTERVAL '${DEFAULT_GRACE_DAYS} days' < CURRENT_DATE
        AND cd.fine_id IS NULL
    `)

    for (const due of overdue) {
      await withClient(async (client) => {
        const fineAmount = parseFloat(due.fine_amount) || DEFAULT_LOAN_PENALTY

        // Create fine
        const { rows: [fine] } = await client.query(
          `INSERT INTO fines (group_id, member_id, amount, reason, status)
           VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
          [due.group_id, due.member_id, fineAmount,
           `Missed contribution due ${due.due_date}`]
        )

        // Update due record
        await client.query(
          `UPDATE contribution_dues
           SET status = 'overdue', fine_id = $1, updated_at = NOW()
           WHERE id = $2`,
          [fine.id, due.id]
        )

        // Update member total_fines
        await client.query(
          `UPDATE members SET total_fines = total_fines + $1, updated_at = NOW()
           WHERE id = $2`,
          [fineAmount, due.member_id]
        )

        console.log(`[enforcement] Fined member ${due.member_id} Ksh ${fineAmount} for missed contribution ${due.due_date}`)
      })
    }

    console.log(`[enforcement] Contribution check done — ${overdue.length} fines issued`)
  } catch (err) {
    console.error('[enforcement] Contribution check error:', err.message)
  }
}

// ── 2. Loan overdue checker ───────────────────────────────────────────────────
async function checkLoanOverdue() {
  console.log('[enforcement] Running loan overdue check...')
  try {
    // Find active/extended loans past due date not yet flagged today
    const { rows: overdue } = await pool.query(`
      SELECT l.*, g.loan_late_penalty AS penalty_amount
      FROM loans l
      JOIN groups g ON g.id = l.group_id
      WHERE l.status IN ('active', 'extended')
        AND l.due_date < CURRENT_DATE
        AND l.amount_remaining > 0
        AND (l.overdue_flagged_at IS NULL
             OR l.overdue_flagged_at < CURRENT_DATE - INTERVAL '30 days')
    `)

    for (const loan of overdue) {
      await withClient(async (client) => {
        const penalty = parseFloat(loan.penalty_amount) || DEFAULT_LOAN_PENALTY

        // Add penalty to loan
        await client.query(
          `UPDATE loans
           SET status = 'overdue',
               penalty_total = penalty_total + $1,
               amount_remaining = amount_remaining + $1,
               overdue_flagged_at = NOW(),
               updated_at = NOW()
           WHERE id = $2`,
          [penalty, loan.id]
        )

        // Create a fine record so it shows in member's statement
        const { rows: [fine] } = await client.query(
          `INSERT INTO fines (group_id, member_id, amount, reason, status)
           VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
          [loan.group_id, loan.member_id, penalty,
           `Late loan repayment penalty — Loan #${loan.id}`]
        )

        // Update member total_fines
        await client.query(
          `UPDATE members SET total_fines = total_fines + $1, updated_at = NOW()
           WHERE id = $2`,
          [penalty, loan.member_id]
        )

        console.log(`[enforcement] Loan #${loan.id} flagged overdue — member ${loan.member_id} penalised Ksh ${penalty}`)
      })
    }

    console.log(`[enforcement] Loan check done — ${overdue.length} loans flagged`)
  } catch (err) {
    console.error('[enforcement] Loan check error:', err.message)
  }
}

// ── Schedule ──────────────────────────────────────────────────────────────────
function startEnforcementJobs() {
  // Daily at 08:00
  cron.schedule('0 8 * * *', checkContributionDues, { timezone: 'Africa/Nairobi' })

  // Daily at 08:15
  cron.schedule('15 8 * * *', checkLoanOverdue, { timezone: 'Africa/Nairobi' })

  console.log('✅ Enforcement cron jobs scheduled (Africa/Nairobi)')
}

module.exports = { startEnforcementJobs, checkContributionDues, checkLoanOverdue }
