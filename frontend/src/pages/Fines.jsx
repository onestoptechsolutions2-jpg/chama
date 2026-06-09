import { useState } from 'react'
import { useMembers, useFines, useCreateFine, useUpdateFine, ksh } from '../hooks/useChama'
import { PageHeader, Card, CardTitle, Table, Tr, Td, Avatar, Badge, Btn, Sel, Input, Grid2, Loader, Toast } from '../components/UI'

export default function Fines() {
  const { data: members=[] }           = useMembers()
  const { data: fines=[], isLoading }  = useFines()
  const createF = useCreateFine()
  const updateF = useUpdateFine()

  const [form, setForm]   = useState({ memberId:'', type:'lateness', date: new Date().toISOString().split('T')[0] })
  const [toast, setToast] = useState(null)
  const notify = (msg, type='ok') => { setToast({msg,type}); setTimeout(()=>setToast(null),3000) }

  const recordFine = async () => {
    if (!form.memberId) { notify('Select a member','err'); return }
    const amount = form.type === 'lateness' ? 50 : 100
    try {
      await createF.mutateAsync({
        member_id:    Number(form.memberId),
        type:          form.type,
        amount,
        meeting_date:  form.date,
      })
      notify(`Fine of ${ksh(amount)} recorded`)
      setForm(f => ({ ...f, memberId:'' }))
    } catch(e) { notify('Failed: '+(e?.response?.data?.error||e.message),'err') }
  }

  const markPaid = async (fine) => {
    try {
      await updateF.mutateAsync({ id: fine.id, data: { status:'paid' } })
      notify('Fine marked as paid')
    } catch(e) { notify('Failed','err') }
  }

  if (isLoading) return <Loader />

  const pending  = fines.filter(f => f.status === 'pending')
  const paid     = fines.filter(f => f.status !== 'pending')

  return (
    <div>
      <PageHeader title="Fines" sub={`${pending.length} outstanding · Lateness: Ksh 50 · Absence: Ksh 100`} />

      <Card>
        <CardTitle>Record Fine</CardTitle>
        <Grid2>
          <Sel label="Member" value={form.memberId} onChange={e=>setForm(f=>({...f,memberId:e.target.value}))}>
            <option value="">— Select member —</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Sel>
          <Sel label="Type" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
            <option value="lateness">Lateness (Ksh 50)</option>
            <option value="absence">Absence (Ksh 100)</option>
            <option value="rule_violation">Rule Violation</option>
            <option value="other">Other</option>
          </Sel>
        </Grid2>
        <Input label="Meeting date" type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={{ maxWidth:220 }} />
        <Btn variant="primary" onClick={recordFine} disabled={createF.isPending}>
          {createF.isPending ? 'Recording...' : 'Record fine'}
        </Btn>
      </Card>

      <Card>
        <CardTitle>Outstanding Fines</CardTitle>
        <Table
          heads={['Member','Type','Amount','Date','Action']}
          empty="No outstanding fines 🎉"
          rows={pending.map(f => (
            <Tr key={f.id}>
              <Td><div style={{ display:'flex', alignItems:'center', gap:8 }}><Avatar name={f.member_name} size={26}/>{f.member_name||'—'}</div></Td>
              <Td><Badge variant="warn">{f.type}</Badge></Td>
              <Td mono>{ksh(f.amount)}</Td>
              <Td>{f.meeting_date ? new Date(f.meeting_date).toLocaleDateString('en-KE') : '—'}</Td>
              <Td>
                <div style={{ display:'flex', gap:6 }}>
                  <Btn onClick={()=>markPaid(f)}>Mark paid</Btn>
                  <Btn onClick={()=>updateF.mutate({id:f.id,data:{status:'waived'}})}>Waive</Btn>
                </div>
              </Td>
            </Tr>
          ))}
        />
      </Card>

      {paid.length > 0 && (
        <Card>
          <CardTitle>Paid / Waived</CardTitle>
          <Table
            heads={['Member','Type','Amount','Status']}
            empty=""
            rows={paid.slice(0,20).map(f => (
              <Tr key={f.id}>
                <Td>{f.member_name}</Td>
                <Td>{f.type}</Td>
                <Td mono>{ksh(f.amount)}</Td>
                <Td><Badge variant={f.status==='paid'?'ok':'info'}>{f.status}</Badge></Td>
              </Tr>
            ))}
          />
        </Card>
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
