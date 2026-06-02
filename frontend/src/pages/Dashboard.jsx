import { useMembers, useLoans, useMgr, ksh, totalSavings, activeLoans } from '../hooks/useChama'
import { Metric, Grid4, Grid2, Card, CardTitle, Loader, Avatar, Badge, Td, Tr, Table } from '../components/UI'

export default function Dashboard() {
  const { data: members=[], isLoading: lm } = useMembers()
  const { data: loans=[],   isLoading: ll } = useLoans()
  const { data: mgr=[],     isLoading: lmg } = useMgr()

  if (lm||ll||lmg) return <Loader text="Loading dashboard..." />

  const totalCap = members.reduce((s,m) => s+(m.capital||0), 0)
  const totalSec = members.reduce((s,m) => s+(m.security||0), 0)
  const totalPS  = members.reduce((s,m) => s+(m.personalSavings||0), 0)
  const active   = activeLoans(loans)
  const loanBal  = active.reduce((s,l) => s+(l.amountRemaining||0), 0)
  const thisMonth = mgr[0]

  // Next first Sunday
  const nextSunday = () => {
    const d = new Date(); d.setDate(1)
    d.setMonth(d.getMonth()+1)
    while (d.getDay() !== 0) d.setDate(d.getDate()+1)
    return d.toLocaleDateString('en-KE',{weekday:'long',day:'numeric',month:'long',year:'numeric'})
  }

  return (
    <div>
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:600 }}>Dashboard</h1>
        <p style={{ color:'var(--muted)', fontSize:13, marginTop:3 }}>Chama overview · {new Date().toLocaleDateString('en-KE',{month:'long',year:'numeric'})}</p>
      </div>

      <Grid4>
        <Metric label="Total Capital"       value={ksh(totalCap)} sub={`${members.length} members`} />
        <Metric label="Security Pool"       value={ksh(totalSec)} />
        <Metric label="Personal Savings"    value={ksh(totalPS)} />
        <Metric label="Loans Outstanding"   value={ksh(loanBal)}  sub={`${active.length} active`} />
      </Grid4>

      <Grid2>
        <Card>
          <CardTitle>This Month · MGR</CardTitle>
          <table style={{ width:'100%', fontSize:13, borderCollapse:'collapse' }}>
            <tbody>
              {[
                ['Recipients', thisMonth ? `${thisMonth.member?.name||'—'} & ${thisMonth.member2?.name||'—'}` : '—'],
                ['MGR pool',   ksh(100000)],
                ['Each (security paid early)', ksh(50000)],
                ['Each (security deducted)',   ksh(47000)],
                ['Month', thisMonth?.month || '—'],
                ['Next meeting', nextSunday()],
              ].map(([k,v]) => (
                <tr key={k}>
                  <td style={{ padding:'6px 0', color:'var(--muted)' }}>{k}</td>
                  <td style={{ padding:'6px 0', fontWeight:500 }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <CardTitle>Active Loans</CardTitle>
          {active.length === 0
            ? <p style={{ color:'var(--muted)', fontSize:13 }}>No active loans 🎉</p>
            : active.slice(0,6).map(l => (
              <div key={l.documentId} style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 0', borderBottom:'1px solid var(--border)' }}>
                <Avatar name={l.member?.name} size={30} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:500 }}>{l.member?.name||'—'}</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>{ksh(l.amountRemaining)} remaining</div>
                </div>
                <Badge variant={l.loanstatus==='extended'?'warn':l.loanstatus==='overdue'?'danger':'info'}>{l.loanstatus}</Badge>
              </div>
            ))}
        </Card>
      </Grid2>
    </div>
  )
}
