import { useDashboard, ksh, activeLoans } from '../hooks/useChama'
import { useGroup } from '../hooks/useChama'
import { Metric, Grid4, Grid2, Card, CardTitle, Loader, Avatar, Badge } from '../components/UI'

export default function Dashboard() {
  const { data: dash, isLoading } = useDashboard()
  const { data: group } = useGroup()

  if (isLoading || !dash) return <Loader text="Loading dashboard..." />

  const { members: ms, loans: ls, welfare: ws, mgr_next, recent_fines } = dash
  const active = parseInt(ls?.active_loans || 0)
  const groupType = group?.type || 'chama'
  const showMgr     = ['chama','hybrid'].includes(groupType)
  const showWelfare = ['welfare','hybrid'].includes(groupType)

  return (
    <div>
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:600 }}>{group?.name || 'Dashboard'}</h1>
        <p style={{ color:'var(--muted)', fontSize:13, marginTop:3 }}>
          {groupType.charAt(0).toUpperCase()+groupType.slice(1)} · {new Date().toLocaleDateString('en-KE',{month:'long',year:'numeric'})}
        </p>
      </div>

      <Grid4>
        <Metric label="Total Capital"     value={ksh(ms?.total_capital)}        sub={`${ms?.total_members || 0} members`} />
        <Metric label="Security Pool"     value={ksh(ms?.total_security)} />
        <Metric label="Personal Savings"  value={ksh(ms?.total_personal_savings)} />
        {showWelfare
          ? <Metric label="Welfare Fund"  value={ksh(ms?.total_welfare)}        sub={`${ws?.pending_claims || 0} pending claims`} />
          : <Metric label="Loans Outstanding" value={ksh(ls?.outstanding_balance)} sub={`${active} active`} />
        }
      </Grid4>

      <Grid2>
        {showMgr && (
          <Card>
            <CardTitle>Next MGR</CardTitle>
            {mgr_next ? (
              <table style={{ width:'100%', fontSize:13, borderCollapse:'collapse' }}>
                <tbody>
                  {[
                    ['Month',      mgr_next.month],
                    ['Recipient 1', mgr_next.member1_name || '—'],
                    ['Recipient 2', mgr_next.member2_name || '—'],
                    ['Pool',       ksh(mgr_next.pool_amount)],
                    ['Each',       ksh(mgr_next.pool_amount / 2)],
                  ].map(([k,v]) => (
                    <tr key={k}>
                      <td style={{ padding:'6px 0', color:'var(--muted)' }}>{k}</td>
                      <td style={{ padding:'6px 0', fontWeight:500 }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p style={{ color:'var(--muted)', fontSize:13 }}>No upcoming MGR scheduled.</p>}
          </Card>
        )}

        <Card>
          <CardTitle>Active Loans</CardTitle>
          {active === 0
            ? <p style={{ color:'var(--muted)', fontSize:13 }}>No active loans 🎉</p>
            : <div>
                <p style={{ fontSize:13, marginBottom:8 }}>
                  <strong>{active}</strong> active · <strong>{ksh(ls?.outstanding_balance)}</strong> outstanding
                  {parseInt(ls?.overdue_loans||0) > 0 && (
                    <span style={{ color:'var(--danger)', marginLeft:8 }}>⚠ {ls.overdue_loans} overdue</span>
                  )}
                </p>
              </div>
          }
        </Card>

        {showWelfare && (
          <Card>
            <CardTitle>Welfare Claims</CardTitle>
            <table style={{ width:'100%', fontSize:13, borderCollapse:'collapse' }}>
              <tbody>
                {[
                  ['Pending',   ws?.pending_claims   || 0],
                  ['Approved',  ws?.approved_claims  || 0],
                  ['Disbursed', ksh(ws?.total_disbursed || 0)],
                ].map(([k,v]) => (
                  <tr key={k}>
                    <td style={{ padding:'6px 0', color:'var(--muted)' }}>{k}</td>
                    <td style={{ padding:'6px 0', fontWeight:500 }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {recent_fines?.length > 0 && (
          <Card>
            <CardTitle>Outstanding Fines</CardTitle>
            {recent_fines.map(f => (
              <div key={f.id} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
                <span>{f.member_name}</span>
                <span style={{ color:'var(--danger)', fontWeight:500 }}>{ksh(f.amount)}</span>
              </div>
            ))}
          </Card>
        )}
      </Grid2>
    </div>
  )
}
