import { useState } from 'react'
import { useMembers, useLoans, useCreateMember, useUpdateMember, ksh, totalSavings, loanLimit, activeLoans } from '../hooks/useChama'
import { PageHeader, Card, CardTitle, Table, Tr, Td, Avatar, Badge, Btn, Input, Sel, Grid2, Loader, Toast } from '../components/UI'

export default function Members() {
  const { data: members=[], isLoading } = useMembers()
  const { data: loans=[] }              = useLoans()
  const createM = useCreateMember()
  const updateM = useUpdateMember()

  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState({ name:'', phone:'', email:'', capital:10000, security:3000 })
  const [savForm, setSavForm]     = useState({ memberId:'', amount:500 })
  const [toast, setToast]         = useState(null)

  const notify = (msg, type='ok') => { setToast({msg,type}); setTimeout(()=>setToast(null),3000) }

  const handleAdd = async () => {
    if (!form.name) { notify('Name is required','err'); return }
    try {
      await createM.mutateAsync({ name:form.name, phone:form.phone, email:form.email, capital:Number(form.capital), security:Number(form.security) })
      notify('Member added!')
      setForm({ name:'', phone:'', email:'', capital:10000, security:3000 })
      setShowForm(false)
    } catch(e) { notify('Failed: '+e.message,'err') }
  }

  const handleSavings = async () => {
    if (!savForm.memberId) { notify('Select a member','err'); return }
    const amt = Number(savForm.amount)
    if (amt < 500) { notify('Minimum is Ksh 500','err'); return }
    const m = members.find(x => x.id === Number(savForm.memberId))
    if (!m) return
    try {
      await updateM.mutateAsync({ id: m.id, data: { personal_savings: (Number(m.personal_savings)||0) + amt } })
      notify('Savings recorded!')
      setSavForm({ memberId:'', amount:500 })
    } catch(e) { notify('Failed: '+e.message,'err') }
  }

  if (isLoading) return <Loader />

  const al = activeLoans(loans)

  return (
    <div>
      <PageHeader title="Members" sub={`${members.length} registered members`}
        action={<Btn variant="primary" onClick={()=>setShowForm(s=>!s)}>+ Add member</Btn>} />

      {showForm && (
        <Card>
          <CardTitle>New Member</CardTitle>
          <Grid2>
            <Input label="Full name *"    value={form.name}     onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Alice Wanjiku" />
            <Input label="Phone"          value={form.phone}    onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="07xx xxx xxx" />
          </Grid2>
          <Grid2>
            <Input label="Capital (Ksh)"  type="number" value={form.capital}   onChange={e=>setForm(f=>({...f,capital:e.target.value}))} />
            <Input label="Security (Ksh)" type="number" value={form.security}  onChange={e=>setForm(f=>({...f,security:e.target.value}))} />
          </Grid2>
          <div style={{ display:'flex', gap:8 }}>
            <Btn variant="primary" onClick={handleAdd} disabled={createM.isPending}>
              {createM.isPending ? 'Saving...' : 'Save member'}
            </Btn>
            <Btn onClick={()=>setShowForm(false)}>Cancel</Btn>
          </div>
        </Card>
      )}

      <Card>
        <Table
          heads={['Member','Capital','Security','Savings','Total','Loan Limit','Loan']}
          empty="No members yet"
          rows={members.map(m => {
            const loan = al.find(l => l.member_id === m.id)
            return (
              <Tr key={m.id}>
                <Td><div style={{ display:'flex', alignItems:'center', gap:8 }}><Avatar name={m.name} /><div><div style={{ fontWeight:500 }}>{m.name}</div><div style={{ fontSize:11, color:'var(--muted)' }}>{m.phone}</div></div></div></Td>
                <Td mono>{ksh(m.capital)}</Td>
                <Td mono>{ksh(m.security)}</Td>
                <Td mono>{ksh(m.personal_savings)}</Td>
                <Td mono bold>{ksh(totalSavings(m))}</Td>
                <Td mono><span style={{ color:'var(--accent)' }}>{ksh(loanLimit(m))}</span></Td>
                <Td>{loan ? <Badge variant={loan.status==='extended'?'warn':'info'}>{loan.status}</Badge> : <Badge variant="ok">Clear</Badge>}</Td>
              </Tr>
            )
          })}
        />
      </Card>

      <Card>
        <CardTitle>Record Personal Savings</CardTitle>
        <Grid2>
          <Sel label="Member" value={savForm.memberId} onChange={e=>setSavForm(f=>({...f,memberId:e.target.value}))}>
            <option value="">— Select member —</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Sel>
          <Input label="Amount (min Ksh 500)" type="number" min="500" value={savForm.amount} onChange={e=>setSavForm(f=>({...f,amount:e.target.value}))} />
        </Grid2>
        <Btn variant="primary" onClick={handleSavings} disabled={updateM.isPending}>
          {updateM.isPending ? 'Saving...' : 'Record savings'}
        </Btn>
      </Card>

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
