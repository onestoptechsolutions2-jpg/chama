import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useMembers, useLoans, useCreateLoan, useRepayLoan, useUpdateLoan, ksh, loanLimit, activeLoans } from '../hooks/useChama'
import { PageHeader, Card, CardTitle, Table, Tr, Td, Avatar, Badge, Btn, Input, Sel, Grid2, Loader, Toast } from '../components/UI'
import { getLoanApplications, reviewLoanApplication } from '../api'

const TAB_LOANS = 'loans'
const TAB_APPS  = 'applications'

export default function Loans() {
  const { data: members=[] }          = useMembers()
  const { data: loans=[], isLoading } = useLoans()
  const createL = useCreateLoan()
  const repayL  = useRepayLoan()
  const updateL = useUpdateLoan()
  const qc      = useQueryClient()

  const [tab,  setTab]   = useState(TAB_LOANS)
  const [form, setForm]  = useState({ memberId:'', amount:8000 })
  const [toast, setToast] = useState(null)

  const notify = (msg, type='ok') => { setToast({msg,type}); setTimeout(()=>setToast(null),3500) }

  const { data: applications=[] } = useQuery({
    queryKey: ['loan-applications'],
    queryFn: getLoanApplications,
  })
  const pendingApps = applications.filter(a => a.status === 'pending')

  const reviewMut = useMutation({
    mutationFn: ({ id, data }) => reviewLoanApplication(id, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries(['loan-applications'])
      qc.invalidateQueries(['loans'])
      notify(vars.data.status === 'approved' ? '✅ Loan approved and created!' : 'Application rejected.')
    },
    onError: (e) => notify(e?.response?.data?.error || 'Failed', 'err'),
  })

  const active   = activeLoans(loans)
  const eligible = members.filter(m => !active.find(l => l.member_id === m.id))

  const approveLoan = async () => {
    if (!form.memberId) { notify('Select a member','err'); return }
    const member = members.find(m => m.id === Number(form.memberId))
    const amt    = Number(form.amount)
    const limit  = loanLimit(member)
    if (amt < 1000)  { notify('Minimum loan is Ksh 1,000','err'); return }
    if (amt > limit) { notify(`Exceeds limit of ${ksh(limit)}`, 'err'); return }
    try {
      await createL.mutateAsync({ member_id: Number(form.memberId), principal: amt })
      notify('Loan approved!')
      setForm({ memberId:'', amount:8000 })
    } catch(e) { notify((e?.response?.data?.error || e.message), 'err') }
  }

  const repay = async (loan) => {
    const monthly = Math.round((loan.total_repayable||0) / 3)
    const newBal  = Math.max(0, (loan.amount_remaining||0) - monthly)
    try {
      await repayL.mutateAsync({ id: loan.id, data: { amount: monthly } })
      notify(newBal <= 0 ? '✅ Loan cleared!' : `Repayment recorded. ${ksh(newBal)} remaining.`)
    } catch(e) { notify('Failed: '+(e?.response?.data?.error||e.message),'err') }
  }

  const extend = async (loan) => {
    try {
      await updateL.mutateAsync({ id: loan.id, data: { status:'extended', extended:true, limit_reduced_by_extension:true } })
      notify('Extended. Future loan limit reduced by 50%.')
    } catch(e) { notify('Failed','err') }
  }

  if (isLoading) return <Loader />

  const statusColor = { pending:'warn', approved:'ok', rejected:'danger', cancelled:'default' }

  return (
    <div>
      <PageHeader title="Loans" sub={`${active.length} active · ${pendingApps.length} pending applications`} />

      {/* Tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:20 }}>
        {[
          { key: TAB_LOANS, label: 'Active Loans' },
          { key: TAB_APPS,  label: `Applications${pendingApps.length > 0 ? ` (${pendingApps.length})` : ''}` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding:'7px 18px', borderRadius:20, fontSize:13, fontWeight:500, cursor:'pointer',
            border: '1px solid var(--border)',
            background: tab === t.key ? 'var(--accent)' : 'var(--card)',
            color:      tab === t.key ? '#fff'          : 'var(--text)',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === TAB_LOANS && (
        <>
          <Card>
            <CardTitle>Active & Overdue Loans</CardTitle>
            <Table
              heads={['Member','Principal','Total Repayable','Balance','Status','Actions']}
              empty="No active loans 🎉"
              rows={active.map(l => (
                <Tr key={l.id}>
                  <Td><div style={{ display:'flex', alignItems:'center', gap:8 }}><Avatar name={l.member_name} size={28}/>{l.member_name||'—'}</div></Td>
                  <Td mono>{ksh(l.principal)}</Td>
                  <Td mono>{ksh(l.total_repayable)}</Td>
                  <Td mono bold><span style={{ color:'var(--danger)' }}>{ksh(l.amount_remaining)}</span></Td>
                  <Td><Badge variant={l.status==='extended'?'warn':l.status==='overdue'?'danger':'info'}>{l.status}</Badge></Td>
                  <Td>
                    <div style={{ display:'flex', gap:6 }}>
                      <Btn variant="primary" onClick={()=>repay(l)} disabled={repayL.isPending}>Repayment</Btn>
                      {l.status==='active' && <Btn variant="danger" onClick={()=>extend(l)}>Extend</Btn>}
                    </div>
                  </Td>
                </Tr>
              ))}
            />
          </Card>

          <Card>
            <CardTitle>New Loan (Manual)</CardTitle>
            <div style={{ background:'var(--accent-lt)', borderRadius:'var(--r)', padding:'10px 14px', fontSize:12, color:'var(--accent)', marginBottom:16, lineHeight:1.7 }}>
              <strong>Rules:</strong> 20% interest · 3-month repayment · Loan limit = 2× total savings · Extension = +1 month, limit halved permanently
            </div>
            <Grid2>
              <Sel label="Member (eligible only)" value={form.memberId} onChange={e=>setForm(f=>({...f,memberId:e.target.value}))}>
                <option value="">— Select member —</option>
                {eligible.map(m => <option key={m.id} value={m.id}>{m.name} · limit {ksh(loanLimit(m))}</option>)}
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
        </>
      )}

      {tab === TAB_APPS && (
        <Card>
          <CardTitle>Loan Applications</CardTitle>
          {applications.length === 0 ? (
            <div style={{ textAlign:'center', padding:40, color:'var(--muted)', fontSize:14 }}>No applications yet.</div>
          ) : (
            <Table
              heads={['Member','Amount','Purpose','Repayment','Date','Status','Actions']}
              rows={applications.map(a => (
                <Tr key={a.id}>
                  <Td>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <Avatar name={a.member_name} size={26} />
                      <div>
                        <div style={{ fontSize:13, fontWeight:500 }}>{a.member_name}</div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>{a.member_phone || ''}</div>
                      </div>
                    </div>
                  </Td>
                  <Td mono bold>{ksh(a.amount_requested)}</Td>
                  <Td><span style={{ fontSize:12 }}>{a.purpose || '—'}</span></Td>
                  <Td>{a.repayment_months} months</Td>
                  <Td><span style={{ fontSize:12 }}>{new Date(a.created_at).toLocaleDateString()}</span></Td>
                  <Td><Badge variant={statusColor[a.status] || 'default'}>{a.status}</Badge></Td>
                  <Td>
                    {a.status === 'pending' ? (
                      <div style={{ display:'flex', gap:6 }}>
                        <Btn
                          variant="primary"
                          disabled={reviewMut.isPending}
                          onClick={() => reviewMut.mutate({ id: a.id, data: { status: 'approved' } })}
                        >Approve</Btn>
                        <Btn
                          variant="danger"
                          disabled={reviewMut.isPending}
                          onClick={() => {
                            const notes = window.prompt('Reason for rejection (optional):')
                            if (notes === null) return
                            reviewMut.mutate({ id: a.id, data: { status: 'rejected', review_notes: notes } })
                          }}
                        >Reject</Btn>
                      </div>
                    ) : (
                      <span style={{ fontSize:11, color:'var(--muted)' }}>
                        {a.reviewed_by_name ? `by ${a.reviewed_by_name}` : '—'}
                      </span>
                    )}
                  </Td>
                </Tr>
              ))}
            />
          )}
        </Card>
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
