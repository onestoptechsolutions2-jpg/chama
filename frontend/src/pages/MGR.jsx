import { useState } from 'react'
import { useMgr, useMembers, useUpdateMgr, useCreateMgr, ksh } from '../hooks/useChama'
import { useAuth } from '../context/AuthContext'
import { PageHeader, Card, CardTitle, Badge, Btn, Sel, Input, Grid2, Loader, Toast, Avatar } from '../components/UI'

// Generate next 12 months from now
const genMonths = () => {
  const months = []; const d = new Date()
  for (let i = 0; i < 12; i++) {
    const nd = new Date(d.getFullYear(), d.getMonth() + i, 1)
    months.push(nd.toLocaleDateString('en-KE', { month:'short', year:'numeric' }))
  }
  return months
}
const MONTHS = genMonths()

export default function MGR() {
  const { data: schedule=[], isLoading } = useMgr()
  const { data: members=[] }             = useMembers()
  const updateMgr  = useUpdateMgr()
  const createMgr  = useCreateMgr()
  const { isStaff } = useAuth()

  const [form, setForm]   = useState({ month: MONTHS[0], month_index:1,m1:'', m2:'', pool_amount:100000 })
  const [toast, setToast] = useState(null)
  const notify = (msg, type='ok') => { setToast({msg,type}); setTimeout(()=>setToast(null),3000) }

  const markPaid = async (slot) => {
    try {
      await updateMgr.mutateAsync({ id: slot.id, data: { status:'paid', paid_date: new Date().toISOString().split('T')[0] } })
      notify('Marked as paid ✅')
    } catch(e) { notify('Failed','err') }
  }

  const addSlot = async () => {
    if (!form.m1 || !form.m2)  { notify('Select both recipients','err'); return }
    if (form.m1 === form.m2)    { notify('Recipients must be different','err'); return }
    const nextIdx = schedule.length ? Math.max(...schedule.map(s=>s.month_index)) + 1 : 1
    try {
      await createMgr.mutateAsync({
        month:       form.month,
        month_index: nextIdx,
        member1_id:  Number(form.m1),
        member2_id:  Number(form.m2),
        pool_amount: Number(form.pool_amount),
      })
      notify('Schedule entry added!')
      setForm({ month: MONTHS[0], month_index:1,m1:'', m2:'', pool_amount:100000 })
    } catch(e) { notify('Failed: '+(e?.response?.data?.error||e.message),'err') }
  }

  if (isLoading) return <Loader />

  const pendingSchedule = schedule.filter(s => s.status === 'pending')

  return (
    <div>
      <PageHeader title="Merry-Go-Round" sub="2 recipients/month · MGR is independent of loans" />

      <Card>
        <CardTitle>Schedule</CardTitle>
        {schedule.length === 0
          ? <p style={{ color:'var(--muted)', fontSize:13 }}>No schedule yet. Add entries below.</p>
          : schedule.map((slot, i) => {
              const r1   = slot.member1_name || '—'
              const r2   = slot.member2_name || '—'
              const curr = slot.status === 'pending' && i === schedule.findIndex(s=>s.status==='pending')
              return (
                <div key={slot.id} style={{
                  display:'flex', alignItems:'center', justifyContent:'space-between',
                  padding:'10px 14px', border:`1px solid ${curr?'var(--accent)':'var(--border)'}`,
                  borderRadius:'var(--r)', marginBottom:6,
                  background: curr ? 'var(--accent-lt)' : 'var(--surface)',
                }}>
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, fontWeight:500 }}>
                      <Avatar name={r1} size={26} />{r1}
                      <span style={{ color:'var(--muted)' }}>&</span>
                      <Avatar name={r2} size={26} />{r2}
                    </div>
                    <div style={{ fontSize:11, color:'var(--muted)', marginTop:3, paddingLeft:34 }}>
                      {slot.month} · {ksh(slot.pool_amount / 2)} each
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    {slot.status === 'paid'
                      ? <Badge variant="ok">✓ Paid</Badge>
                      : curr ? <Badge variant="info">Current</Badge>
                             : <Badge>Upcoming</Badge>}
                    {isStaff && slot.status === 'pending' && (
                      <Btn variant="primary" onClick={()=>markPaid(slot)}>Mark paid</Btn>
                    )}
                  </div>
                </div>
              )
            })}
      </Card>

      {isStaff && (
        <Card>
          <CardTitle>Add Schedule Entry</CardTitle>
          <Grid2>
            <Sel label="Month" value={form.month} onChange={e=>setForm(f=>({...f,month:e.target.value}))}>
              {MONTHS.map(m => <option key={m}>{m}</option>)}
            </Sel>
            <Input label="Pool amount (Ksh)" type="number" value={form.pool_amount} onChange={e=>setForm(f=>({...f,pool_amount:e.target.value}))} />
          </Grid2>
          <Grid2>
            <Sel label="Recipient 1" value={form.m1} onChange={e=>setForm(f=>({...f,m1:e.target.value}))}>
              <option value="">— Select member —</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Sel>
            <Sel label="Recipient 2" value={form.m2} onChange={e=>setForm(f=>({...f,m2:e.target.value}))}>
              <option value="">— Select member —</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Sel>
          </Grid2>
          <Btn variant="primary" onClick={addSlot} disabled={createMgr.isPending}>
            {createMgr.isPending ? 'Adding...' : 'Add entry'}
          </Btn>
        </Card>
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
