import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMemberStatement } from '../api'
import { useAuth } from '../context/AuthContext'
import { Card, CardTitle, Badge, Loader } from '../components/UI'
import { ksh } from '../hooks/useChama'

const TYPE_COLOR = {
  contribution: 'ok',
  repayment:    'info',
  fine:         'danger',
  loan:         'warn',
}

const TYPE_ICON = {
  contribution: '💰',
  repayment:    '🔄',
  fine:         '⚠️',
  loan:         '📋',
}

export default function MemberStatement() {
  const { auth } = useAuth()
  const [filter, setFilter] = useState('all')   // all | contribution | repayment | fine | loan

  const { data, isLoading, error } = useQuery({
    queryKey: ['member-statement'],
    queryFn: () => getMemberStatement(),
  })

  if (isLoading) return <Loader />
  if (error)     return <div style={{ padding: 40, color: 'var(--danger)', textAlign: 'center' }}>Failed to load statement.</div>
  if (!data)     return null

  const { member, contributions = [], repayments = [], fines = [], loans = [] } = data

  // Build unified timeline
  const timeline = [
    ...contributions.map(c => ({
      type: 'contribution', date: c.date, amount: c.amount,
      description: c.description || 'Monthly contribution',
      reference: c.reference, status: 'paid',
    })),
    ...repayments.map(r => ({
      type: 'repayment', date: r.date, amount: r.amount,
      description: r.description || 'Loan repayment',
      reference: r.reference, status: 'paid',
    })),
    ...fines.map(f => ({
      type: 'fine', date: f.date, amount: f.amount,
      description: f.description || 'Fine',
      reference: null, status: f.status,
    })),
    ...loans.map(l => ({
      type: 'loan', date: l.issued_date, amount: l.principal,
      description: `Loan issued — ${l.purpose || 'General'}`,
      reference: `#${l.id}`, status: l.status,
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date))

  const filtered = filter === 'all' ? timeline : timeline.filter(t => t.type === filter)

  // Totals
  const totalContributed = contributions.reduce((s, c) => s + parseFloat(c.amount || 0), 0)
  const totalRepaid      = repayments.reduce((s, r) => s + parseFloat(r.amount || 0), 0)
  const totalFined       = fines.filter(f => f.status !== 'waived').reduce((s, f) => s + parseFloat(f.amount || 0), 0)
  const activeLoansCount = loans.filter(l => ['active', 'extended', 'overdue'].includes(l.status)).length

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>My Statement</h1>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>
          Full financial history for {member.name}
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Contributed', value: ksh(totalContributed), color: 'var(--ok)' },
          { label: 'Loans Repaid',      value: ksh(totalRepaid),      color: 'var(--accent)' },
          { label: 'Fines Incurred',    value: ksh(totalFined),       color: totalFined > 0 ? 'var(--danger)' : 'var(--ok)' },
          { label: 'Active Loans',      value: activeLoansCount,       color: activeLoansCount > 0 ? 'var(--warn)' : 'var(--ok)' },
        ].map(({ label, value, color }) => (
          <Card key={label} style={{ textAlign: 'center', padding: '14px 10px' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{label}</div>
          </Card>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {['all', 'contribution', 'repayment', 'fine', 'loan'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500,
              border: '1px solid var(--border)', cursor: 'pointer',
              background: filter === f ? 'var(--accent)' : 'var(--card)',
              color: filter === f ? '#fff' : 'var(--text)',
            }}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1) + 's'}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <Card>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 14 }}>
            No records found.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filtered.map((item, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                  padding: '12px 0', gap: 12,
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flex: 1 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16,
                  }}>
                    {TYPE_ICON[item.type]}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{item.description}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {item.date ? new Date(item.date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      {item.reference && <span style={{ marginLeft: 6 }}>· {item.reference}</span>}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 700,
                    color: item.type === 'fine' ? 'var(--danger)' : item.type === 'loan' ? 'var(--warn)' : 'var(--ok)',
                    fontFamily: "'DM Mono', monospace",
                  }}>
                    {item.type === 'contribution' || item.type === 'repayment' ? '+' : item.type === 'loan' ? '' : '-'}{ksh(item.amount)}
                  </div>
                  <Badge variant={TYPE_COLOR[item.type]} style={{ fontSize: 10, marginTop: 4 }}>
                    {item.type}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
