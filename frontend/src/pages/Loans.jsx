import { useState } from 'react'
import { useMembers, useLoans, useCreateLoan, useUpdateLoan, ksh, totalSavings, loanLimit, activeLoans } from '../hooks/useChama'
import { PageHeader, Card, CardTitle, Table, Tr, Td, Avatar, Badge, Btn, Input, Sel, Grid2, Loader, Toast } from '../components/UI'

export default function Loans() {
  const { data: members=[] } = useMembers()
  const { data: loans=[],   isLoading } = useLoans()
  const createL = useCreateLoan()
  const updateL = useUpdateLoan()

  const [form, setForm]   = useState({ memberId:'', amount:8000 })
  const [toast, setToast] = useState(null)

  const notify = (msg, type='ok') => { setToast({msg,type}); setTimeout(()=>setToast(null),3500) }

  const active = activeLoans(loans)

  // Members without an active loan
  const eligible = members.filter(m => !active.find(l => l.member?.documentId === m.documentId))

  const approveLoan = async () => {
    if (!form.memberId) { notify('Select a member','err'); return }
    const member = members.find(m => m.documentId === form.memberId)
    const amt    = Number(form.amount)
    const limit  = loanLimit(member)
    if (amt < 1000)   { notify('Minimum loan is Ksh 1,000','err'); return }
    if (amt > limit)  { notify(`Exceeds limit of ${ksh(limit)}`, 'err'); return }
    const total  = Math.round(amt * 1.2)
    const due    = new Date(); due.setMonth(due.getMonth()+3)
    try {
      await createL.mutateAsync({
        member:               { connect: [form.memberId] },
        principal:             amt,
        interestRate:          20,
        totalRepayable:        total,
        amountRemaining:       total,
        loanstatus:           'active',          // ← your Strapi field name
        extended:              false,
        limitReducedByExtension: false,
        issuedDate: new Date().toISOString().split('T')[0],
        dueDate:    due.toISOString().split('T')[0],
      })
      notify('Loan approved!')
      setForm({ memberId:'', amount:8000 })
    } catch(e) { notify('Failed: '+e.message,'err') }
  }

  const repay = async (loan) => {
    const monthly  = Math.round((loan.totalRepayable||0) / 3)
    const newBal   = Math.max(0, (loan.amountRemaining||0) - monthly)
    const newStatus = newBal <= 0 ? 'cleared' : 'active'
    try {
      await updateL.mutateAsync({ id: loan.documentId, data: { amountRemaining: newBal, loanstatus: newStatus } })
      notify(newBal <= 0 ? '✅ Loan cleared!' : `Repayment recorded. ${ksh(newBal)} remaining.`)
    } catch(e) { notify('Failed: '+e.message,'err') }
  }

  const extend = async (loan) => {
    try {
      await updateL.mutateAsync({ id: loan.documentId, data: { loanstatus:'extended', extended:true, limitReducedByExtension:true } })
      notify('Extended. Future loan limit reduced by 50%.')
    } catch(e) { notify('Failed: '+e.message,'err') }
  }

  if (isLoading) return <Loader />

  return (
    <div>
      <PageHeader title="Loans" sub={`${active.length} active loans`} />

      <Card>
        <CardTitle>Active & Overdue Loans</CardTitle>
        <Table
          heads={['Member','Principal','Total Repayable','Balance','Status','Actions']}
          empty="No active loans 🎉"
          rows={active.map(l => (
            <Tr key={l.documentId}>
              <Td><div style={{ display:'flex', alignItems:'center', gap:8 }}><Avatar name={l.member?.name} size={28}/>{l.member?.name||'—'}</div></Td>
              <Td mono>{ksh(l.principal)}</Td>
              <Td mono>{ksh(l.totalRepayable)}</Td>
              <Td mono bold><span style={{ color:'var(--danger)' }}>{ksh(l.amountRemaining)}</span></Td>
              <Td><Badge variant={l.loanstatus==='extended'?'warn':l.loanstatus==='overdue'?'danger':'info'}>{l.loanstatus}</Badge></Td>
              <Td>
                <div style={{ display:'flex', gap:6 }}>
                  <Btn size="sm" variant="primary" onClick={()=>repay(l)} disabled={updateL.isPending}>Repayment</Btn>
                  {l.loanstatus==='active' && <Btn size="sm" variant="danger" onClick={()=>extend(l)}>Extend</Btn>}
                </div>
              </Td>
            </Tr>
          ))}
        />
      </Card>

      <Card>
        <CardTitle>New Loan Application</CardTitle>
        <div style={{ background:'var(--accent-lt)', borderRadius:'var(--r)', padding:'10px 14px', fontSize:12, color:'var(--accent)', marginBottom:16, lineHeight:1.7 }}>
          <strong>Rules:</strong> 20% interest · 3-month repayment · Loan limit = 2× total savings · MGR payout unaffected · Extension = +1 month, limit halved permanently
        </div>
        <Grid2>
          <Sel label="Member (eligible only)" value={form.memberId} onChange={e=>setForm(f=>({...f,memberId:e.target.value}))}>
            <option value="">— Select member —</option>
            {eligible.map(m => <option key={m.documentId} value={m.documentId}>{m.name} · limit {ksh(loanLimit(m))}</option>)}
          </Sel>
          <Input label="Amount (Ksh)" type="number" min="1000" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} />
        </Grid2>
        {form.memberId && (
          <p style={{ fontSize:12, color:'var(--muted)', marginBottom:12 }}>
            Monthly instalment: <strong>{ksh(Math.round(Number(form.amount)*1.2/3))}</strong> · Total repayable: <strong>{ksh(Math.round(Number(form.amount)*1.2))}</strong>
          </p>
        )}
        <Btn variant="primary" onClick={approveLoan} disabled={createL.isPending}>
          {createL.isPending ? 'Processing...' : 'Approve Loan'}
        </Btn>
      </Card>

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
