import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useMembers, useLoans, ksh, loanLimit, totalSavings, activeLoans } from '../hooks/useChama'
import { Card, CardTitle, Badge, Loader, Button } from '../components/UI'
import { applyForLoan, getLoanApplications, cancelLoanApplication } from '../api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const MONTHS = [3, 6, 9, 12]

export default function MyLoan() {
  const { auth }                         = useAuth()
  const { data: members = [], isLoading } = useMembers()
  const { data: loans = [] }             = useLoans()
  const qc                               = useQueryClient()

  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState({ amount_requested: '', purpose: '', repayment_months: 3 })
  const [err, setErr]             = useState('')
  const [success, setSuccess]     = useState('')

  const memberId = auth?.user?.member_id
  const m        = memberId ? members.find(x => x.id === memberId) : null
  const loan     = m ? activeLoans(loans).find(l => l.member_id === m.id) : null
  const limit    = m ? loanLimit(m) : 0

  const { data: applications = [] } = useQuery({
    queryKey: ['loan-applications'],
    queryFn: getLoanApplications,
    enabled: !!memberId,
  })
  const myApps  = applications.filter(a => a.member_id === memberId)
  const pending = myApps.find(a => a.status === 'pending')

  const applyMut = useMutation({
    mutationFn: applyForLoan,
    onSuccess: () => {
      qc.invalidateQueries(['loan-applications'])
      setShowForm(false)
      setForm({ amount_requested: '', purpose: '', repayment_months: 3 })
      setSuccess('Application submitted — the treasurer will review it shortly.')
      setErr('')
    },
    onError: (e) => setErr(e?.response?.data?.error || 'Failed to submit'),
  })

  const cancelMut = useMutation({
    mutationFn: cancelLoanApplication,
    onSuccess: () => qc.invalidateQueries(['loan-applications']),
  })

  if (isLoading) return <Loader />

  const monthly = loan ? Math.round((loan.total_repayable || 0) / (loan.repayment_months || 3)) : 0
  const loanRows = loan ? [
    ['Principal',          ksh(loan.principal)],
    ['Interest rate',      `${loan.interest_rate}%`],
    ['Total repayable',    ksh(loan.total_repayable)],
    ['Balance remaining',  <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{ksh(loan.amount_remaining)}</span>],
    ['Status',             <Badge variant={loan.status === 'extended' ? 'warn' : loan.status === 'overdue' ? 'danger' : 'info'}>{loan.status}</Badge>],
    ['Issued',             loan.issued_date || '—'],
    ['Due date',           loan.due_date || '—'],
  ] : []

  const statusColor = { pending: 'var(--warn)', approved: 'var(--ok)', rejected: 'var(--danger)', cancelled: 'var(--muted)' }

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>My Loan</h1>
          {m && <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>Loan limit: <strong>{ksh(limit)}</strong></p>}
        </div>
        {!loan && !pending && m && (
          <Button onClick={() => { setShowForm(v => !v); setErr(''); setSuccess('') }}>
            {showForm ? 'Cancel' : '+ Apply for Loan'}
          </Button>
        )}
      </div>

      {success && (
        <div style={{ background: 'var(--ok-lt, #f0fdf4)', border: '1px solid var(--ok)', borderRadius: 'var(--r)', padding: '10px 14px', marginBottom: 16, color: 'var(--ok)', fontSize: 13 }}>
          {success}
        </div>
      )}

      {/* Application form */}
      {showForm && !loan && !pending && (
        <Card style={{ marginBottom: 20 }}>
          <CardTitle>Loan Application</CardTitle>
          {err && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{err}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontSize: 13 }}>
              <span style={{ color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Amount (Ksh) — max {ksh(limit)}</span>
              <input
                type="number" min="1" max={limit}
                value={form.amount_requested}
                onChange={e => setForm(f => ({ ...f, amount_requested: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box' }}
                placeholder="e.g. 20000"
              />
            </label>
            <label style={{ fontSize: 13 }}>
              <span style={{ color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Purpose</span>
              <input
                type="text"
                value={form.purpose}
                onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box' }}
                placeholder="e.g. School fees, Business, Medical..."
              />
            </label>
            <label style={{ fontSize: 13 }}>
              <span style={{ color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Repayment period</span>
              <select
                value={form.repayment_months}
                onChange={e => setForm(f => ({ ...f, repayment_months: parseInt(e.target.value) }))}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r)', border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box' }}
              >
                {MONTHS.map(m => <option key={m} value={m}>{m} months</option>)}
              </select>
            </label>
            <Button
              disabled={!form.amount_requested || applyMut.isPending}
              onClick={() => { setErr(''); applyMut.mutate(form) }}
              style={{ alignSelf: 'flex-start' }}
            >
              {applyMut.isPending ? 'Submitting…' : 'Submit Application'}
            </Button>
          </div>
        </Card>
      )}

      {/* Pending application notice */}
      {pending && !loan && (
        <Card style={{ marginBottom: 20, borderLeft: '4px solid var(--warn)' }}>
          <CardTitle>Application Pending Review</CardTitle>
          <table style={{ width: '100%' }}>
            <tbody>
              {[
                ['Amount requested', ksh(pending.amount_requested)],
                ['Purpose',          pending.purpose || '—'],
                ['Repayment',        `${pending.repayment_months} months`],
                ['Submitted',        new Date(pending.created_at).toLocaleDateString()],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td style={{ padding: '6px 0', color: 'var(--muted)', fontSize: 13 }}>{k}</td>
                  <td style={{ padding: '6px 0', fontSize: 13, fontWeight: 500 }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={() => cancelMut.mutate(pending.id)}
            style={{ marginTop: 12, fontSize: 12, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Cancel application
          </button>
        </Card>
      )}

      {/* Active loan */}
      {loan ? (
        <Card>
          <CardTitle>Active Loan</CardTitle>
          <table style={{ width: '100%' }}>
            <tbody>
              {loanRows.map(([k, v]) => (
                <tr key={k}>
                  <td style={{ padding: '7px 0', color: 'var(--muted)', fontSize: 13 }}>{k}</td>
                  <td style={{ padding: '7px 0', fontWeight: 500, fontSize: 13 }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {loan.extended && (
            <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--warn-lt,#fffbeb)', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--warn)' }}>
              This loan was extended — your future loan limit is reduced 50%.
            </div>
          )}
          <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--accent-lt)', borderRadius: 'var(--r)', fontSize: 12, color: 'var(--accent)' }}>
            Your MGR payout is not affected by this loan.
          </div>
        </Card>
      ) : !pending && !showForm && (
        <Card style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 40 }}>✅</div>
          <div style={{ fontWeight: 600, fontSize: 16, margin: '12px 0 4px' }}>No active loan</div>
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>Your loan limit: {m ? ksh(limit) : '—'}</div>
        </Card>
      )}

      {/* Past applications */}
      {myApps.filter(a => a.status !== 'pending').length > 0 && (
        <Card style={{ marginTop: 20 }}>
          <CardTitle>Past Applications</CardTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {myApps.filter(a => a.status !== 'pending').map(a => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <strong>{ksh(a.amount_requested)}</strong>
                  {a.purpose && <span style={{ color: 'var(--muted)', marginLeft: 8 }}>{a.purpose}</span>}
                  <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>{new Date(a.created_at).toLocaleDateString()}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: statusColor[a.status] || 'var(--muted)', textTransform: 'uppercase' }}>{a.status}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
