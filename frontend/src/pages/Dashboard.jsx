import { useDashboard, ksh } from '../hooks/useChama'
import { useGroup }          from '../hooks/useChama'
import { useAuth }           from '../context/AuthContext'
import { Metric, Grid4, Grid2, Card, CardTitle, Loader, Avatar, Badge, ProgressBar, EmptyState } from '../components/UI'

function greet() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function FineRow({ fine }) {
  const statusColor = { pending:'warn', paid:'ok', waived:'grey' }
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 0', borderBottom:'1px solid var(--border)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <Avatar name={fine.member_name} size={28} />
        <div>
          <div style={{ fontSize:13, fontWeight:500 }}>{fine.member_name}</div>
          <div style={{ fontSize:11, color:'var(--muted)' }}>{fine.reason || fine.type}</div>
        </div>
      </div>
      <div style={{ textAlign:'right' }}>
        <div style={{ fontSize:12, fontFamily:"'DM Mono',monospace", fontWeight:600 }}>{ksh(fine.amount)}</div>
        <Badge variant={statusColor[fine.status]||'grey'}>{fine.status}</Badge>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { data: dash, isLoading } = useDashboard()
  const { data: group }           = useGroup()
  const { auth }                  = useAuth()

  if (isLoading || !dash) return <Loader text="Loading dashboard…" />

  const { members: ms, loans: ls, welfare: ws, mgr_next, recent_fines } = dash
  const active      = parseInt(ls?.active_loans || 0)
  const overdue     = parseInt(ls?.overdue_loans || 0)
  const groupType   = group?.type || 'chama'
  const showMgr     = ['chama','hybrid'].includes(groupType)
  const showWelfare = ['welfare','hybrid'].includes(groupType)
  const showLoans   = ['chama','hybrid','selfhelp'].includes(groupType)

  const totalSavings = (
    Number(ms?.total_capital||0) +
    Number(ms?.total_security||0) +
    Number(ms?.total_personal_savings||0)
  )
  const memberCount = parseInt(ms?.total_members || 0)

  // Rough savings progress toward a 1M target per member (just visual context)
  const savingsPerMember = memberCount > 0 ? totalSavings / memberCount : 0
  const savingsProgress  = Math.min(100, (savingsPerMember / 100000) * 100)

  return (
    <div>
      {/* Welcome */}
      <div style={{ marginBottom:26 }}>
        <h1 style={{ fontSize:22, fontWeight:600 }}>
          {greet()}, {auth?.user?.name?.split(' ')[0] || 'there'} 👋
        </h1>
        <p style={{ color:'var(--muted)', fontSize:13, marginTop:4 }}>
          {group?.name || 'Dashboard'} · {new Date().toLocaleDateString('en-KE',{ weekday:'long', month:'long', day:'numeric' })}
        </p>
      </div>

      {/* Metric strip */}
      <Grid4>
        <Metric
          label="Total Capital"
          value={ksh(ms?.total_capital)}
          sub={`${memberCount} member${memberCount!==1?'s':''}`}
          accent="green"
        />
        <Metric
          label="Security Pool"
          value={ksh(ms?.total_security)}
          accent="blue"
        />
        <Metric
          label="Personal Savings"
          value={ksh(ms?.total_personal_savings)}
          accent="green"
        />
        {showWelfare
          ? <Metric
              label="Welfare Fund"
              value={ksh(ms?.total_welfare)}
              sub={ws?.pending_claims > 0 ? `${ws.pending_claims} pending` : 'No pending claims'}
              accent={ws?.pending_claims > 0 ? 'yellow' : 'green'}
            />
          : <Metric
              label="Loans Outstanding"
              value={ksh(ls?.outstanding_balance)}
              sub={`${active} active${overdue>0?' · '+overdue+' overdue':''}`}
              accent={overdue > 0 ? 'red' : 'yellow'}
            />
        }
      </Grid4>

      {/* Second row */}
      <Grid2>

        {/* Savings health */}
        <Card>
          <CardTitle>Savings Health</CardTitle>
          <div style={{ marginBottom:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:6 }}>
              <span style={{ color:'var(--muted)' }}>Total group savings</span>
              <span style={{ fontWeight:600, fontFamily:"'DM Mono',monospace" }}>{ksh(totalSavings)}</span>
            </div>
            <ProgressBar value={savingsProgress} color="var(--accent)" height={8} label={`Avg per member vs Ksh 100k target`} />
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:12 }}>
            {[
              { label:'Capital',   val: ms?.total_capital,          color:'var(--accent)' },
              { label:'Security',  val: ms?.total_security,         color:'#1565c0' },
              { label:'Savings',   val: ms?.total_personal_savings, color:'#7e57c2' },
              ...(showWelfare ? [{ label:'Welfare', val: ms?.total_welfare, color:'#e67e22' }] : []),
            ].map(({ label, val, color }) => (
              <div key={label} style={{ display:'flex', alignItems:'center', gap:7 }}>
                <div style={{ width:9, height:9, borderRadius:3, background:color, flexShrink:0 }} />
                <div style={{ fontSize:11, color:'var(--muted)' }}>{label}</div>
                <div style={{ fontSize:11, fontWeight:600, fontFamily:"'DM Mono',monospace", marginLeft:'auto' }}>{ksh(val)}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Loans summary OR MGR */}
        {showMgr ? (
          <Card>
            <CardTitle>Next MGR Rotation</CardTitle>
            {mgr_next ? (
              <div>
                <div style={{ fontSize:24, fontWeight:700, color:'var(--accent)', fontFamily:"'DM Mono',monospace", marginBottom:4 }}>
                  {ksh(mgr_next.pool_amount / 2)}
                  <span style={{ fontSize:12, fontWeight:400, color:'var(--muted)', fontFamily:'inherit', marginLeft:6 }}>each</span>
                </div>
                <div style={{ fontSize:12, color:'var(--muted)', marginBottom:16 }}>{mgr_next.month}</div>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {[mgr_next.member1_name, mgr_next.member2_name].filter(Boolean).map((n,i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:9, padding:'8px 10px', background:'var(--surface2)', borderRadius:10 }}>
                      <Avatar name={n} size={28} />
                      <div>
                        <div style={{ fontSize:13, fontWeight:500 }}>{n}</div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>Recipient {i+1}</div>
                      </div>
                      <div style={{ marginLeft:'auto', fontSize:12, fontFamily:"'DM Mono',monospace", fontWeight:600, color:'var(--accent)' }}>
                        {ksh(mgr_next.pool_amount / 2)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState icon="🔄" title="No upcoming MGR" body="Schedule a rotation to see it here" />
            )}
          </Card>
        ) : showLoans ? (
          <Card>
            <CardTitle>Loans at a Glance</CardTitle>
            {active === 0 ? (
              <EmptyState icon="🎉" title="No active loans" body="All members are loan-free" />
            ) : (
              <div>
                <div style={{ fontSize:28, fontWeight:700, color: overdue>0?'var(--danger)':'var(--accent)', fontFamily:"'DM Mono',monospace", marginBottom:4 }}>
                  {active}
                  <span style={{ fontSize:12, fontWeight:400, color:'var(--muted)', fontFamily:'inherit', marginLeft:6 }}>active</span>
                </div>
                <div style={{ fontSize:12, color:'var(--muted)', marginBottom:14 }}>{ksh(ls?.outstanding_balance)} outstanding</div>
                {overdue > 0 && (
                  <div style={{ padding:'8px 12px', background:'var(--danger-lt)', borderRadius:10, borderLeft:'3px solid var(--danger)', fontSize:12, color:'var(--danger)', fontWeight:500 }}>
                    ⚠ {overdue} loan{overdue>1?'s':''} overdue
                  </div>
                )}
                <div style={{ marginTop:14 }}>
                  <ProgressBar
                    value={parseInt(ls?.cleared_loans||0)}
                    max={parseInt(ls?.cleared_loans||0)+active}
                    label="Cleared vs active"
                    color="var(--accent)"
                    height={6}
                  />
                </div>
              </div>
            )}
          </Card>
        ) : null}

      </Grid2>

      {/* Recent fines */}
      {recent_fines?.length > 0 && (
        <Card>
          <CardTitle>Recent Pending Fines</CardTitle>
          {recent_fines.map((f,i) => <FineRow key={i} fine={f} />)}
        </Card>
      )}

      {/* Welfare pending */}
      {showWelfare && parseInt(ws?.pending_claims||0) > 0 && (
        <Card style={{ borderLeft:'3px solid var(--warn)', background:'var(--warn-lt)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:20 }}>🏥</span>
            <div>
              <div style={{ fontSize:13, fontWeight:600 }}>
                {ws.pending_claims} welfare claim{ws.pending_claims>1?'s':''} awaiting review
              </div>
              <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>
                Go to Welfare to review and approve
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
