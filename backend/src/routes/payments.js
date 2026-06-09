const router  = require('express').Router()
const https   = require('https')
const { query } = require('../config/database')
const { authenticate, authorize } = require('../middleware/auth')

// ─── Daraja helpers ───────────────────────────────────────────

async function getDarajaToken() {
  const key    = process.env.DARAJA_CONSUMER_KEY    || ''
  const secret = process.env.DARAJA_CONSUMER_SECRET || ''
  const auth   = Buffer.from(`${key}:${secret}`).toString('base64')
  const isSandbox = (process.env.DARAJA_ENV || 'sandbox') === 'sandbox'
  const host   = isSandbox ? 'sandbox.safaricom.co.ke' : 'api.safaricom.co.ke'

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: host,
      path: '/oauth/v1/generate?grant_type=client_credentials',
      method: 'GET',
      headers: { Authorization: `Basic ${auth}` },
    }, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => {
        try { resolve(JSON.parse(data).access_token) }
        catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

async function stkPush({ phone, amount, accountRef, description }) {
  const isSandbox = (process.env.DARAJA_ENV || 'sandbox') === 'sandbox'
  const host      = isSandbox ? 'sandbox.safaricom.co.ke' : 'api.safaricom.co.ke'
  const shortcode = process.env.DARAJA_SHORTCODE  || '174379'
  const passkey   = process.env.DARAJA_PASSKEY    || ''
  const callbackUrl = process.env.DARAJA_CALLBACK_URL || 'https://example.com/api/payments/callback'

  const timestamp = new Date().toISOString().replace(/[-T:.Z]/g,'').slice(0,14)
  const password  = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64')

  // Normalise phone: 07XXXXXXXX → 2547XXXXXXXX
  const ph = String(phone).replace(/^0/, '254').replace(/^\+/, '')

  const token = await getDarajaToken()
  const body  = JSON.stringify({
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Math.ceil(amount),
    PartyA: ph,
    PartyB: shortcode,
    PhoneNumber: ph,
    CallBackURL: callbackUrl,
    AccountReference: accountRef,
    TransactionDesc: description,
  })

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: host,
      path: '/mpesa/stkpush/v1/processrequest',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    }, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// ─── Platform fee STK Push ────────────────────────────────────

// POST /api/payments/platform-fee  — 5% MGR fee charged to group admin
router.post('/platform-fee', authenticate, authorize('admin'), async (req, res) => {
  const { mgr_schedule_id, amount, phone } = req.body
  if (!amount || !phone) return res.status(400).json({ error: 'amount and phone required' })

  const feePct = 5
  const feeAmt = (amount * feePct) / 100

  try {
    const result = await stkPush({
      phone,
      amount: feeAmt,
      accountRef: `Chama-${req.user.group_id}`,
      description: `Platform fee - MGR payout`,
    })

    if (result.ResponseCode !== '0') {
      return res.status(400).json({ error: result.ResponseDescription || 'STK push failed' })
    }

    const { rows } = await query(
      `INSERT INTO platform_payments
         (group_id, mgr_schedule_id, amount, fee_pct, phone, checkout_request_id, status, type)
       VALUES ($1,$2,$3,$4,$5,$6,'pending','platform_fee') RETURNING *`,
      [req.user.group_id, mgr_schedule_id || null, feeAmt, feePct, phone, result.CheckoutRequestID]
    )
    res.status(201).json({ payment: rows[0], stk: result })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'STK push error: ' + err.message })
  }
})

// POST /api/payments/callback  — Daraja STK callback
router.post('/callback', async (req, res) => {
  try {
    const cb  = req.body?.Body?.stkCallback
    if (!cb)  return res.sendStatus(200)
    const checkoutId = cb.CheckoutRequestID
    const success    = cb.ResultCode === 0
    const mpesaRef   = cb.CallbackMetadata?.Item?.find(i => i.Name === 'MpesaReceiptNumber')?.Value || null

    await query(
      `UPDATE platform_payments
       SET status = $1, mpesa_ref = $2, updated_at = NOW()
       WHERE checkout_request_id = $3`,
      [success ? 'paid' : 'failed', mpesaRef, checkoutId]
    )
    res.sendStatus(200)
  } catch (err) {
    console.error(err)
    res.sendStatus(200)
  }
})

// GET /api/payments  — list platform payments for group
router.get('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM platform_payments WHERE group_id=$1 ORDER BY created_at DESC`,
      [req.user.group_id]
    )
    res.json(rows)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }) }
})

module.exports = router
