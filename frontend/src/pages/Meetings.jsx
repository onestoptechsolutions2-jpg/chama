import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '../api'
import { useAuth } from '../context/AuthContext'
import { useMembers } from '../hooks/useChama'
import { PageHeader, Card, CardTitle, Table, Tr, Td, Badge, Btn, Input, Sel, Grid2, Loader, Toast, Avatar } from '../components/UI'

// ── Hooks ────────────────────────────────────────────────────────────────────
function useMeetings() {
  return useQuery({ queryKey:['meetings'], queryFn:()=>api.get('/api/meetings') })
}
function useCreateMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: data => api.post('/api/meetings', data),
    onSuccess: () => qc.invalidateQueries({ queryKey:['meetings'] }),
  })
}
function useMarkAttendance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, records }) => api.post(`/api/meetings/${id}/attendance`, { records }),
    onSuccess: () => { qc.invalidateQueries({ queryKey:['meetings'] }); qc.invalidateQueries({ queryKey:['fines'] }) },
  })
}

const statusVariant = s => ({ scheduled:'info', completed:'ok', cancelled:'danger' }[s] || 'ok')

// ── Component ────────────────────────────────────────────────────────────────
export default function Meetings() {
  const { isStaff } = useAuth()
  const { data: meetings=[], isLoading } = useMeetings()
  const { data: members=[] }             = useMembers()
  const createM    = useCreateMeeting()
  const markAttend = useMarkAttendance()

  const today = new Date().toISOString().split('T')[0]
  const [form, setForm]         = useState({ date: today, agenda:'', venue:'' })
  const [showForm, setShowForm] = useState(false)

  // Attendance panel
  const [openId, setOpenId]     = useState(null)
  const [attendance, setAttendance] = useState({}) // { memberId: 'present'|'absent'|'late' }

  const [toast, setToast] = useState(null)
  const notify = (msg, type='ok') => { setToast({msg,type}); setTimeout(()=>setToast(null),3500) }
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}))

  const handleCreate = async () => {
    if (!form.date) { notify('Date is required','err'); return }
    try {
      await createM.mutateAsync({ date: form.date, agenda: form.agenda, venue: form.venue })
      notify('Meeting created!')
      setForm({ date: today, agenda:'', venue:'' })
      setShowForm(false)
    } catch(e) { notify('Failed: '+(e?.response?.data?.error||e.message),'err') }
  }

  const openAttendance = (mtg) => {
    setOpenId(mtg.id)
    // Pre-fill with existing attendance if any
    const init = {}
    members.forEach(m => { init[m.id] = 'present' })
    if (mtg.attendance) {
      mtg.attendance.forEach(a => { init[a.member_id] = a.status })
    }
    setAttendance(init)
  }

  const handleSaveAttendance = async () => {
    const records = Object.entries(attendance).map(([member_id, status]) => ({
      member_id: Number(member_id), status,
    }))
    try {
      await markAttend.mutateAsync({ id: openId, records })
      notify('Attendance saved! Fines auto-created for absent/late.')
      setOpenId(null)
    } catch(e) { notify('Failed: '+(e?.response?.data?.error||e.message),'err') }
  }

  if (isLoading) return <Loader />

  const upcoming  = meetings.filter(m => m.status === 'scheduled')
  const past      = meetings.filter(m => m.status !== 'scheduled')

  return (
    <div>
      <PageHeader
        title="Meetings"
        sub={`${upcoming.length} upcoming · ${past.length} past`}
        action={isStaff && <Btn variant="primary" onClick={()=>setShowForm(s=>!s)}>{showForm?'Cancel':'+ Schedule meeting'}</Btn>}
      />

      {/* Create form */}
      {showForm && isStaff && (
        <Card>
          <CardTitle>Schedule Meeting</CardTitle>
          <Grid2>
            <Input label="Date *"   type="date" value={form.date}   onChange={set('date')} />
            <Input label="Venue"    value={form.venue}  onChange={set('venue')} placeholder="e.g. Zoom / Community Hall" />
          </Grid2>
          <Input label="Agenda"     value={form.agenda} onChange={set('agenda')} placeholder="Brief agenda…" />
          <Btn variant="primary" onClick={handleCreate} disabled={createM.isPending}>
            {createM.isPending ? 'Saving...' : 'Create meeting'}
          </Btn>
        </Card>
      )}

      {/* Attendance panel */}
      {openId && (
        <Card>
          <CardTitle>Mark Attendance</CardTitle>
          <p style={{ fontSize:12, color:'var(--muted)', marginBottom:12 }}>
            Absent = Ksh 100 fine · Late = Ksh 50 fine — auto-created on save.
          </p>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {members.map(m => (
              <div key={m.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 10px', borderRadius:'var(--r)', border:'1px solid var(--border)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <Avatar name={m.name} size={26} />
                  <span style={{ fontSize:13 }}>{m.name}</span>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  {['present','late','absent'].map(s => (
                    <Btn key={s}
                      variant={attendance[m.id]===s ? (s==='present'?'primary':s==='late'?'warn':'danger') : undefined}
                      onClick={()=>setAttendance(a=>({...a,[m.id]:s}))}
                      style={{ fontSize:11, padding:'3px 10px', ...(attendance[m.id]===s && s==='late' ? {background:'var(--warn)',color:'#fff',borderColor:'var(--warn)'} : {}), ...(attendance[m.id]===s && s==='absent' ? {background:'var(--danger)',color:'#fff',borderColor:'var(--danger)'} : {}) }}
                    >
                      {s.charAt(0).toUpperCase()+s.slice(1)}
                    </Btn>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:8, marginTop:14 }}>
            <Btn variant="primary" onClick={handleSaveAttendance} disabled={markAttend.isPending}>
              {markAttend.isPending ? 'Saving...' : 'Save attendance'}
            </Btn>
            <Btn onClick={()=>setOpenId(null)}>Cancel</Btn>
          </div>
        </Card>
      )}

      {/* Upcoming */}
      <Card>
        <CardTitle>Upcoming</CardTitle>
        <Table
          heads={['Date','Venue','Agenda','Action']}
          empty="No upcoming meetings scheduled"
          rows={upcoming.map(m => (
            <Tr key={m.id}>
              <Td><strong>{new Date(m.date).toLocaleDateString('en-KE',{weekday:'short',day:'numeric',month:'short',year:'numeric'})}</strong></Td>
              <Td>{m.venue||'—'}</Td>
              <Td style={{ maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.agenda||'—'}</Td>
              <Td>
                {isStaff && (
                  <Btn variant="primary" onClick={()=>openAttendance(m)}>Mark attendance</Btn>
                )}
              </Td>
            </Tr>
          ))}
        />
      </Card>

      {/* Past */}
      {past.length > 0 && (
        <Card>
          <CardTitle>Past Meetings</CardTitle>
          <Table
            heads={['Date','Venue','Status','Action']}
            empty=""
            rows={past.map(m => (
              <Tr key={m.id}>
                <Td>{new Date(m.date).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'})}</Td>
                <Td>{m.venue||'—'}</Td>
                <Td><Badge variant={statusVariant(m.status)}>{m.status}</Badge></Td>
                <Td>
                  {isStaff && (
                    <Btn onClick={()=>openAttendance(m)}>Re-mark</Btn>
                  )}
                </Td>
              </Tr>
            ))}
          />
        </Card>
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
