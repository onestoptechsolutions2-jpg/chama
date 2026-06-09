import { useState } from 'react'
import { useProjects, useMembers, useCreateProject, useUpdateProject, ksh } from '../hooks/useChama'
import { useAuth } from '../context/AuthContext'
import { PageHeader, Card, CardTitle, Table, Tr, Td, Badge, Btn, Input, Grid2, Loader, Toast } from '../components/UI'
import * as api from '../api'
import { useQueryClient } from '@tanstack/react-query'

const statusVariant = s => ({ planning:'info', active:'ok', on_hold:'warn', completed:'ok', cancelled:'danger' }[s] || 'info')

export default function Projects() {
  const { data: projects=[], isLoading } = useProjects()
  const { data: members=[] }             = useMembers()
  const createProject = useCreateProject()
  const updateProject = useUpdateProject()
  const { isStaff } = useAuth()
  const qc = useQueryClient()

  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState({ name:'', description:'', target_amount:'', start_date:'', end_date:'' })
  const [contribForm, setContribForm] = useState({ project_id:null, member_id:'', amount:'', reference:'' })
  const [toast, setToast] = useState(null)

  const notify = (msg, type='ok') => { setToast({msg,type}); setTimeout(()=>setToast(null),3000) }
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}))

  const handleCreate = async () => {
    if (!form.name) { notify('Name required','err'); return }
    try {
      await createProject.mutateAsync({ ...form, target_amount: Number(form.target_amount)||0 })
      notify('Project created!')
      setForm({ name:'', description:'', target_amount:'', start_date:'', end_date:'' })
      setShowForm(false)
    } catch(e) { notify('Failed: '+(e?.response?.data?.error||e.message),'err') }
  }

  const handleContrib = async () => {
    if (!contribForm.member_id || !contribForm.amount) { notify('Member and amount required','err'); return }
    try {
      await api.addProjectContrib(contribForm.project_id, {
        member_id: Number(contribForm.member_id),
        amount: Number(contribForm.amount),
        reference: contribForm.reference || undefined,
      })
      qc.invalidateQueries({ queryKey:['projects'] })
      notify('Contribution recorded!')
      setContribForm({ project_id:null, member_id:'', amount:'', reference:'' })
    } catch(e) { notify('Failed','err') }
  }

  if (isLoading) return <Loader />

  return (
    <div>
      <PageHeader title="Projects" sub={`${projects.length} projects`}
        action={isStaff && <Btn variant="primary" onClick={()=>setShowForm(s=>!s)}>+ New Project</Btn>} />

      {showForm && (
        <Card>
          <CardTitle>New Project</CardTitle>
          <Grid2>
            <Input label="Project Name *" value={form.name} onChange={set('name')} />
            <Input label="Target Amount (Ksh)" type="number" value={form.target_amount} onChange={set('target_amount')} />
          </Grid2>
          <Grid2>
            <Input label="Start Date" type="date" value={form.start_date} onChange={set('start_date')} />
            <Input label="End Date"   type="date" value={form.end_date}   onChange={set('end_date')} />
          </Grid2>
          <div style={{ marginTop:8 }}>
            <label style={{ display:'block', fontSize:12, fontWeight:500, color:'var(--muted)', marginBottom:5 }}>Description</label>
            <textarea value={form.description} onChange={set('description')} rows={2}
              style={{ width:'100%', padding:'8px 10px', border:'1px solid var(--border)', borderRadius:'var(--r)', fontFamily:'inherit', fontSize:13, resize:'vertical', boxSizing:'border-box' }} />
          </div>
          <div style={{ display:'flex', gap:8, marginTop:12 }}>
            <Btn variant="primary" onClick={handleCreate} disabled={createProject.isPending}>Save</Btn>
            <Btn onClick={()=>setShowForm(false)}>Cancel</Btn>
          </div>
        </Card>
      )}

      {projects.map(p => {
        const pct = p.target_amount > 0 ? Math.min(100, Math.round((p.collected_amount / p.target_amount) * 100)) : 0
        return (
          <Card key={p.id}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
              <div>
                <div style={{ fontWeight:600, fontSize:15 }}>{p.name}</div>
                {p.description && <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>{p.description}</div>}
              </div>
              <Badge variant={statusVariant(p.status)}>{p.status.replace('_',' ')}</Badge>
            </div>

            <div style={{ fontSize:13, marginBottom:8 }}>
              <span style={{ color:'var(--muted)' }}>Target: </span><strong>{ksh(p.target_amount)}</strong>
              <span style={{ color:'var(--muted)', marginLeft:16 }}>Raised: </span><strong style={{ color:'var(--accent)' }}>{ksh(p.collected_amount)}</strong>
              <span style={{ color:'var(--muted)', marginLeft:16 }}>Contributors: </span><strong>{p.contributor_count || 0}</strong>
            </div>

            {p.target_amount > 0 && (
              <div style={{ background:'var(--border)', borderRadius:4, height:6, marginBottom:12 }}>
                <div style={{ width:`${pct}%`, background:'var(--accent)', height:'100%', borderRadius:4, transition:'width .3s' }} />
              </div>
            )}

            {isStaff && p.status === 'active' && (
              <div>
                <div style={{ fontSize:12, fontWeight:500, color:'var(--muted)', marginBottom:6 }}>Record Contribution</div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <select value={contribForm.project_id===p.id?contribForm.member_id:''}
                    onChange={e=>setContribForm(f=>({...f,project_id:p.id,member_id:e.target.value}))}
                    style={{ padding:'7px 10px', border:'1px solid var(--border)', borderRadius:'var(--r)', fontFamily:'inherit', fontSize:12 }}>
                    <option value="">— Member —</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <input type="number" placeholder="Amount"
                    value={contribForm.project_id===p.id?contribForm.amount:''}
                    onChange={e=>setContribForm(f=>({...f,project_id:p.id,amount:e.target.value}))}
                    style={{ width:110, padding:'7px 10px', border:'1px solid var(--border)', borderRadius:'var(--r)', fontFamily:'inherit', fontSize:12 }} />
                  <Btn variant="primary" onClick={()=>{setContribForm(f=>({...f,project_id:p.id}));handleContrib()}}>
                    Record
                  </Btn>
                  {isStaff && (
                    <Btn onClick={()=>updateProject.mutate({id:p.id,data:{status:'completed'}})}>
                      Mark Complete
                    </Btn>
                  )}
                </div>
              </div>
            )}
          </Card>
        )
      })}

      {projects.length === 0 && (
        <Card><p style={{ color:'var(--muted)', fontSize:13, textAlign:'center', padding:24 }}>No projects yet.</p></Card>
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
