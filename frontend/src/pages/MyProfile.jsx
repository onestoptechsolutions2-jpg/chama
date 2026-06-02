import { useAuth } from '../context/AuthContext'
import { useMembers, useLoans, useMgr, ksh, totalSavings, loanLimit, activeLoans } from '../hooks/useChama'
import { Card, CardTitle, Grid2, Avatar, Badge, Loader } from '../components/UI'

export default function MyProfile() {
  const { auth }             = useAuth()
  const { data: members=[], isLoading } = useMembers()
  const { data: loans=[] }   = useLoans()
  const { data: mgr=[] }     = useMgr()

  if (isLoading) return <Loader />

  const m     = members.find(x => x.documentId === auth?.memberDocId)
  if (!m) return <div style={{ padding:40, color:'var(--muted)', textAlign:'center' }}>Profile not found. Ask the Treasurer to add your record.</div>

  const ts    = totalSavings(m)
  const ll    = loanLimit(m)
  const loan  = activeLoans(loans).find(l => l.member?.documentId === m.documentId)
  const mgrSlot = mgr.find(s => s.member?.documentId===m.documentId || s.member2?.documentId===m.documentId)

  const row = (label, value) => (
    <tr key={label}>
      <td style={{ padding:'7px 0', color:'var(--muted)', fontSize:13 }}>{label}</td>
      <td style={{ padding:'7px 0', fontWeight:500, fontSize:13 }}>{value}</td>
    </tr>
  )

  return (
    <div>
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:600 }}>My Profile</h1>
        <p style={{ color:'var(--muted)', fontSize:13, marginTop:3 }}>Welcome back, {m.name}</p>
      </div>
      <Grid2>
        <Card>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:18 }}>
            <Avatar name={m.name} size={48} />
            <div><div style={{ fontSize:16, fontWeight:600 }}>{m.name}</div><div style={{ fontSize:12, color:'var(--muted)' }}>{m.phone||'—'}</div></div>
          </div>
          <CardTitle>Savings Breakdown</CardTitle>
          <table style={{ width:'100%' }}>
            <tbody>
              {row('Capital',         <span style={{ fontFamily:"'DM Mono',monospace" }}>{ksh(m.capital)}</span>)}
              {row('Security',        <span style={{ fontFamily:"'DM Mono',monospace" }}>{ksh(m.security)}</span>)}
              {row('Personal savings',<span style={{ fontFamily:"'DM Mono',monospace" }}>{ksh(m.personalSavings)}</span>)}
              {row('Total savings',   <span style={{ fontFamily:"'DM Mono',monospace", fontWeight:700, color:'var(--accent)' }}>{ksh(ts)}</span>)}
              {row('Loan limit',      <span style={{ fontFamily:"'DM Mono',monospace", color:'var(--accent2)' }}>{ksh(ll)}</span>)}
            </tbody>
          </table>
        </Card>
        <Card>
          <CardTitle>Status</CardTitle>
          <table style={{ width:'100%' }}>
            <tbody>
              {row('Active loan',     loan ? <Badge variant="warn">{ksh(loan.amountRemaining)} remaining</Badge> : <Badge variant="ok">None</Badge>)}
              {row('MGR month',       mgrSlot ? <Badge variant="purple">{mgrSlot.month}</Badge> : <Badge variant="grey">Not scheduled yet</Badge>)}
              {row('Security early',  m.securityPaidEarly ? <Badge variant="ok">Yes — full payout</Badge> : <Badge variant="grey">Not yet</Badge>)}
              {row('Total fines',     <span style={{ fontFamily:"'DM Mono',monospace" }}>{ksh(m.totalFines)}</span>)}
            </tbody>
          </table>
          <div style={{ marginTop:14, padding:'10px 12px', background:'var(--accent-lt)', borderRadius:'var(--r)', fontSize:12, color:'var(--accent)', lineHeight:1.7 }}>
            Your MGR payout is <strong>independent</strong> of any loan. You always receive your full amount regardless.
          </div>
        </Card>
      </Grid2>
    </div>
  )
}
