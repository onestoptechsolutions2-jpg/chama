export default function Rules() {
  const rules = [
    ['01', 'Merry-go-round contribution: Ksh 5,000 per member per month.'],
    ['02', 'Two members receive the MGR each month — Ksh 50,000 each from a Ksh 100,000 pool.'],
    ['03', 'Security fee: Ksh 3,000. Pay it early and receive your full payout (Ksh 50,000) with no deduction.'],
    ['04', 'Capital contribution: Ksh 10,000 per member.'],
    ['05', 'First loan starts at Ksh 8,000 at 20% interest, repayable over 3 months.'],
    ['06', 'If a loan is not cleared within 3 months, one extension month is granted — and the member\'s future loan limit is permanently reduced by 50%.'],
    ['07', 'Loans and merry-go-round are fully independent. A member with a loan still receives their full MGR payout.'],
    ['08', 'Personal savings: minimum Ksh 500 per month. Members may save more — all amounts accumulate in their account.'],
    ['09', 'Loan limit = 2× total savings (capital + security + personal savings). More savings = higher limit.'],
    ['10', 'Members may deposit security early to receive full MGR amount — this is optional.'],
    ['11', 'Merry-go-round order will be reshuffled each cycle (no longer fixed as before).'],
    ['12', 'Chama meetings: every first Sunday of the month, starting at 3:00 PM.'],
    ['13', 'Latecoming fine: Ksh 50. Absenteeism fine: Ksh 100.'],
  ]
  return (
    <div>
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:600 }}>Official Rules</h1>
        <p style={{ color:'var(--muted)', fontSize:13, marginTop:3 }}>Effective June 2026 — agreed by all members</p>
      </div>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r-lg)', padding:'4px 18px' }}>
        {rules.map(([num,text]) => (
          <div key={num} style={{ display:'flex', gap:16, padding:'12px 0', borderBottom:'1px solid var(--border)' }}>
            <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:'var(--muted)', minWidth:24, marginTop:2 }}>{num}</span>
            <span style={{ fontSize:13, lineHeight:1.7 }}>{text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
