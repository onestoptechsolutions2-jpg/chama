import { useState } from 'react'
import { useMgr, useMembers, useUpdateMgr, useCreateMgr, ksh } from '../hooks/useChama'
import { useAuth } from '../context/AuthContext'
import { PageHeader, Card, CardTitle, Badge, Btn, Sel, Input, Grid2, Loader, Toast } from '../components/UI'
import { Avatar, initials } from '../components/UI'

const MONTHS = ['Jun 2026','Jul 2026','Aug 2026','Sep 2026','Oct 2026','Nov 2026','Dec 2026','Jan 2027','Feb 2027','Mar 2027']

export default function MGR() {
  const { data: schedule=[], isLoading } = useMgr()
  const { data: members=[] }            = useMembers()
  const updateMgr  = useUpdateMgr()
  const createMgr  = useCreateMgr()
  const { auth }   = useAuth()
  const isTreasurer = auth?.role === 'treasurer'

  const [form, setForm]   = useState({ month:'Jun 2026', m1:'', m2:'', payout:47000 })
  const [toast, setToast] = useState(null)
  const notify = (msg,type='ok') => { setToast({msg,type}); setTimeout(()=>setToast(null),3000) }

  const markPaid = async (slot) => {
    try {
      await updateMgr.mutateAsync({ id: slot.documentId, data: { paid:true, paidDate: new Date().toISOString().split('T')[0] } })
      notify('Marked as paid ✅')
    } catch(e) { notify('Failed: '+e.message,'err') }
  }

  const addSlot = async () => {
    if (!form.m1 || !form.m2) { notify('Select both recipients','err'); return }
    if (form.m1 === form.m2)   { notify('Recipients must be different','err'); return }
    try {
      await createMgr.mutateAsync({
        month:      form.month,
        monthIndex: MONTHS.indexOf(form.month),
        member:     { connect: [form.m1] },
        member2:    { connect: [form.m2] },
        payoutEach: Number(form.payout),
        paid:       false,
      })
      notify('Schedule entry added!')
      setForm({ month:'Jun 2026', m1:'', m2:'', payout:47000 })
    } catch(e) { notify('Failed: '+e.message,'err') }
  }

  if (isLoading) return <Loader />

  return (
    <div>
      <PageHeader title="Merry-Go-Round" sub="2 recipients/month · Ksh 5,000/member · MGR is independent of loans" />

      <Card>
        <CardTitle>Schedule — Jun 2026 → Mar 2027</CardTitle>
        {schedule.length === 0
          ? <p style={{ color:'var(--muted)', fontSize:13 }}>No schedule yet. Add entries below.</p>
          : schedule.map((slot, i) => {
              const r1   = slot.member?.name  || '—'
              const r2   = slot.member2?.name || '—'
              const curr = i === 0 && !slot.paid
              return (
                <div key={slot.documentId} style={{
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
                      {slot.month} · {ksh(slot.payoutEach)} each
                    </div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    {slot.paid
                      ? <Badge variant="ok">✓ Paid</Badge>
                      : curr ? <Badge variant="purple">Current</Badge>
                             : <Badge variant="grey">Upcoming</Badge>}
                    {isTreasurer && !slot.paid && (
                      <Btn size="sm" variant="primary" onClick={()=>markPaid(slot)}>Mark paid</Btn>
                    )}
                  </div>
                </div>
              )
            })}
      </Card>

      {isTreasurer && (
        <Card>
          <CardTitle>Add Schedule Entry</CardTitle>
          <Grid2>
            <Sel label="Month" value={form.month} onChange={e=>setForm(f=>({...f,month:e.target.value}))}>
              {MONTHS.map(m => <option key={m}>{m}</option>)}
            </Sel>
            <Input label="Payout each (Ksh)" type="number" value={form.payout} onChange={e=>setForm(f=>({...f,payout:e.target.value}))} />
          </Grid2>
          <Grid2>
            <Sel label="Recipient 1" value={form.m1} onChange={e=>setForm(f=>({...f,m1:e.target.value}))}>
              <option value="">— Select member —</option>
              {members.map(m => <option key={m.documentId} value={m.documentId}>{m.name}</option>)}
            </Sel>
            <Sel label="Recipient 2" value={form.m2} onChange={e=>setForm(f=>({...f,m2:e.target.value}))}>
              <option value="">— Select member —</option>
              {members.map(m => <option key={m.documentId} value={m.documentId}>{m.name}</option>)}
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
