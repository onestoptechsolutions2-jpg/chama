import { useAuth } from '../context/AuthContext'
import { useMembers, useLoans, ksh, loanLimit, totalSavings, activeLoans } from '../hooks/useChama'
import { Card, CardTitle, Badge, Loader } from '../components/UI'

export default function MyLoan() {
  const { auth }             = useAuth()
  const { data: members=[], isLoading } = useMembers()
  const { data: loans=[] }   = useLoans()

  if (isLoading) return <Loader />

  const memberId = auth?.user?.member_id
  const m    = memberId ? members.find(x => x.id === memberId) : null
  const loan = m ? activeLoans(loans).find(l => l.member_id === m.id) : null

  if (!loan) return (
    <div>
      <div style={{ marginBottom:24 }}><h1 style={{ fontSize:22, fontWeight:600 }}>My Loan</h1></div>
      <Card style={{ textAlign:'center', padding:48 }}>
        <div style={{ fontSize:40 }}>✅</div>
        <div style={{ fontWeight:600, fontSize:16, margin:'12px 0 4px' }}>No active loan</div>
        <div style={{ color:'var(--muted)', fontSize:13 }}>Your loan limit: {m ? ksh(loanLimit(m)) : '—'}</div>
        <div style={{ color:'var(--muted)', fontSize:12, marginTop:8 }}>Contact the Treasurer to apply for a loan.</div>
      </Card>
    </div>
  )

  const monthly = Math.round((loan.total_repayable||0) / 3)
  const rows = [
    ['Principal',          ksh(loan.principal)],
    ['Interest rate',      `${loan.interest_rate}%`],
    ['Total repayable',    ksh(loan.total_repayable)],
    ['Monthly instalment', ksh(monthly)],
    ['Balance remaining',  <span style={{ color:'var(--danger)', fontWeight:700 }}>{ksh(loan.amount_remaining)}</span>],
    ['Status',             <Badge variant={loan.status==='extended'?'warn':loan.status==='overdue'?'danger':'info'}>{loan.status}</Badge>],
    ['Issued',             loan.issued_date||'—'],
    ['Due date',           loan.due_date||'—'],
  ]
  if (loan.extended) rows.push(['Extension note', <span style={{ color:'var(--warn)', fontSize:12 }}>Extended — future limit reduced 50%</span>])

  return (
    <div>
      <div style={{ marginBottom:24 }}><h1 style={{ fontSize:22, fontWeight:600 }}>My Loan</h1></div>
      <Card>
        <CardTitle>Loan Details</CardTitle>
        <table style={{ width:'100%' }}>
          <tbody>
            {rows.map(([k,v]) => (
              <tr key={k}>
                <td style={{ padding:'7px 0', color:'var(--muted)', fontSize:13 }}>{k}</td>
                <td style={{ padding:'7px 0', fontWeight:500, fontSize:13, fontFamily:typeof v==='string'&&v.startsWith('Ksh')?"'DM Mono',monospace":'inherit' }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop:14, padding:'10px 12px', background:'var(--accent-lt)', borderRadius:'var(--r)', fontSize:12, color:'var(--accent)' }}>
          Your merry-go-round payout is not affected by this loan — you will receive your full MGR amount.
        </div>
      </Card>
    </div>
  )
}
