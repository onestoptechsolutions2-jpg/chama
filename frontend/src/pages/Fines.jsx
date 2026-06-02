import { useState } from 'react'
import { useMembers, useFines, useCreateFine, useUpdateFine, useUpdateMember, ksh } from '../hooks/useChama'
import { PageHeader, Card, CardTitle, Table, Tr, Td, Avatar, Badge, Btn, Sel, Input, Grid2, Loader, Toast } from '../components/UI'

export default function Fines() {
  const { data: members=[] }             = useMembers()
  const { data: fines=[],  isLoading }   = useFines()
  const createF  = useCreateFine()
  const updateF  = useUpdateFine()
  const updateM  = useUpdateMember()

  const [form, setForm]   = useState({ memberId:'', reason:'latecoming', date: new Date().toISOString().split('T')[0] })
  const [toast, setToast] = useState(null)
  const notify = (msg,type='ok') => { setToast({msg,type}); setTimeout(()=>setToast(null),3000) }

  const recordFine = async () => {
    if (!form.memberId) { notify('Select a member','err'); return }
    const amount = form.reason === 'latecoming' ? 50 : 100
    const member = members.find(m => m.documentId === form.memberId)
    try {
      await createF.mutateAsync({
        member:      { connect: [form.memberId] },
        reason:       form.reason,
        amount,
        meetingDate:  form.date,
        paid:         false,
      })
      // Update running total on member
      await updateM.mutateAsync({ id: form.memberId, data: { totalFines: (member?.totalFines||0) + amount } })
      notify(`Fine of ${ksh(amount)} recorded`)
      setForm(f => ({ ...f, memberId:'' }))
    } catch(e) { notify('Failed: '+e.message,'err') }
  }

  const markPaid = async (fine) => {
    try {
      await updateF.mutateAsync({ id: fine.documentId, data: { paid: true } })
      notify('Fine marked as paid')
    } catch(e) { notify('Failed','err') }
  }

  if (isLoading) return <Loader />

  return (
    <div>
      <PageHeader title="Fines" sub="Latecoming: Ksh 50 · Absenteeism: Ksh 100 · Meetings: 1st Sunday at 3PM" />

      <Card>
        <CardTitle>Record Fine</CardTitle>
        <Grid2>
          <Sel label="Member" value={form.memberId} onChange={e=>setForm(f=>({...f,memberId:e.target.value}))}>
            <option value="">— Select member —</option>
            {members.map(m => <option key={m.documentId} value={m.documentId}>{m.name}</option>)}
          </Sel>
          <Sel label="Reason" value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))}>
            <option value="latecoming">Latecoming (Ksh 50)</option>
            <option value="absenteeism">Absenteeism (Ksh 100)</option>
          </Sel>
        </Grid2>
        <Input label="Meeting date" type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={{ maxWidth:220 }} />
        <Btn variant="primary" onClick={recordFine} disabled={createF.isPending}>
          {createF.isPending ? 'Recording...' : 'Record fine'}
        </Btn>
      </Card>

      <Card>
        <CardTitle>Fine History</CardTitle>
        <Table
          heads={['Member','Reason','Amount','Date','Paid','Action']}
          empty="No fines recorded"
          rows={fines.map(f => (
            <Tr key={f.documentId}>
              <Td><div style={{ display:'flex', alignItems:'center', gap:8 }}><Avatar name={f.member?.name} size={26}/>{f.member?.name||'—'}</div></Td>
              <Td><Badge variant="warn">{f.reason}</Badge></Td>
              <Td mono>{ksh(f.amount)}</Td>
              <Td>{f.meetingDate||'—'}</Td>
              <Td>{f.paid ? <Badge variant="ok">Paid</Badge> : <Badge variant="danger">Unpaid</Badge>}</Td>
              <Td>{!f.paid && <Btn size="sm" onClick={()=>markPaid(f)}>Mark paid</Btn>}</Td>
            </Tr>
          ))}
        />
      </Card>

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
