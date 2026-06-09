import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '../api'
import { useAuth } from '../context/AuthContext'
import { PageHeader, Card, CardTitle, Table, Tr, Td, Badge, Btn, Input, Sel, Grid2, Loader, Toast, Avatar } from '../components/UI'

const ROLES = ['admin','treasurer','secretary','member']
const roleVariant = r => ({ admin:'danger', treasurer:'warn', secretary:'info', member:'ok' }[r] || 'ok')

// ── Hooks ────────────────────────────────────────────────────────────────────
function useUsers() {
  return useQuery({ queryKey:['users'], queryFn:()=>api.get('/api/users') })
}
function useMembers() {
  return useQuery({ queryKey:['members'], queryFn:()=>api.get('/api/members') })
}
function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: data => api.post('/api/users', data),
    onSuccess: () => qc.invalidateQueries({ queryKey:['users'] }),
  })
}
function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/api/users/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey:['users'] }),
  })
}

// ── Component ────────────────────────────────────────────────────────────────
export default function Users() {
  const { isAdmin } = useAuth()
  const { data: users=[], isLoading } = useUsers()
  const { data: members=[] }          = useMembers()
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()
  const qc = useQueryClient()

  const [form, setForm]           = useState({ name:'', email:'', phone:'', password:'', role:'member', member_id:'' })
  const [showForm, setShowForm]   = useState(false)
  const [editId, setEditId]       = useState(null)
  const [editRole, setEditRole]   = useState('')
  const [resetId, setResetId]     = useState(null)
  const [newPass, setNewPass]     = useState('')
  const [toast, setToast]         = useState(null)

  const notify = (msg, type='ok') => { setToast({msg,type}); setTimeout(()=>setToast(null),3500) }
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleCreate = async () => {
    if (!form.name || !form.email || !form.password) { notify('Name, email and password are required','err'); return }
    try {
      await createUser.mutateAsync({
        name:      form.name,
        email:     form.email,
        phone:     form.phone || null,
        password:  form.password,
        role:      form.role,
        member_id: form.member_id ? Number(form.member_id) : null,
      })
      notify('User created!')
      setForm({ name:'', email:'', phone:'', password:'', role:'member', member_id:'' })
      setShowForm(false)
    } catch(e) { notify('Failed: '+(e?.response?.data?.error||e.message),'err') }
  }

  const handleRoleSave = async (id) => {
    try {
      await updateUser.mutateAsync({ id, data:{ role: editRole } })
      notify('Role updated')
      setEditId(null)
    } catch(e) { notify('Failed','err') }
  }

  const handleResetPassword = async (id) => {
    if (!newPass || newPass.length < 6) { notify('Password must be at least 6 characters','err'); return }
    try {
      await api.post(`/api/users/${id}/reset-password`, { new_password: newPass })
      notify('Password reset!')
      setResetId(null)
      setNewPass('')
    } catch(e) { notify('Failed: '+(e?.response?.data?.error||e.message),'err') }
  }

  const handleToggleActive = async (user) => {
    try {
      await updateUser.mutateAsync({ id: user.id, data:{ active: !user.active } })
      notify(user.active ? 'User deactivated' : 'User activated')
    } catch(e) { notify('Failed','err') }
  }

  if (isLoading) return <Loader />

  const active   = users.filter(u => u.active)
  const inactive = users.filter(u => !u.active)

  // Members not yet linked to a user account
  const unlinkedMembers = members.filter(m => !users.some(u => u.member_id === m.id))

  return (
    <div>
      <PageHeader
        title="User Management"
        sub={`${active.length} active account${active.length!==1?'s':''}`}
        action={isAdmin && <Btn variant="primary" onClick={()=>setShowForm(s=>!s)}>{showForm?'Cancel':'+ New user'}</Btn>}
      />

      {/* Create user form */}
      {showForm && (
        <Card>
          <CardTitle>Create User Account</CardTitle>
          <Grid2>
            <Input label="Full name *"  value={form.name}     onChange={set('name')} />
            <Input label="Email *"      value={form.email}    onChange={set('email')} type="email" />
          </Grid2>
          <Grid2>
            <Input label="Phone"        value={form.phone}    onChange={set('phone')} placeholder="07xxxxxxxx" />
            <Input label="Password *"   value={form.password} onChange={set('password')} type="password" placeholder="min 6 chars" />
          </Grid2>
          <Grid2>
            <Sel label="Role" value={form.role} onChange={set('role')}>
              {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
            </Sel>
            <Sel label="Link to member (optional)" value={form.member_id} onChange={set('member_id')}>
              <option value="">— No member link —</option>
              {unlinkedMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Sel>
          </Grid2>
          <Btn variant="primary" onClick={handleCreate} disabled={createUser.isPending}>
            {createUser.isPending ? 'Creating...' : 'Create user'}
          </Btn>
        </Card>
      )}

      {/* Active users */}
      <Card>
        <CardTitle>Active Users</CardTitle>
        <Table
          heads={['User','Role','Member link','Actions']}
          empty="No active users"
          rows={active.map(u => (
            <Tr key={u.id}>
              <Td>
                <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                  <Avatar name={u.name} size={28} />
                  <div>
                    <div style={{ fontWeight:500, fontSize:13 }}>{u.name}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>{u.email}{u.phone ? ` · ${u.phone}` : ''}</div>
                  </div>
                </div>
              </Td>
              <Td>
                {isAdmin && editId === u.id ? (
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <select value={editRole} onChange={e=>setEditRole(e.target.value)}
                      style={{ fontSize:12, padding:'4px 8px', borderRadius:'var(--r)', border:'1px solid var(--border)', background:'var(--surface)' }}>
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <Btn variant="primary" onClick={()=>handleRoleSave(u.id)}>Save</Btn>
                    <Btn onClick={()=>setEditId(null)}>✕</Btn>
                  </div>
                ) : (
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <Badge variant={roleVariant(u.role)}>{u.role}</Badge>
                    {isAdmin && <Btn onClick={()=>{ setEditId(u.id); setEditRole(u.role) }}>Edit</Btn>}
                  </div>
                )}
              </Td>
              <Td>
                {u.member_name
                  ? <span style={{ fontSize:12, color:'var(--accent)' }}>👤 {u.member_name}</span>
                  : <span style={{ fontSize:12, color:'var(--muted)' }}>None</span>}
              </Td>
              <Td>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {isAdmin && resetId === u.id ? (
                    <>
                      <Input value={newPass} onChange={e=>setNewPass(e.target.value)} placeholder="New password" type="password"
                        style={{ width:140, marginBottom:0, padding:'5px 8px', fontSize:12 }} />
                      <Btn variant="primary" onClick={()=>handleResetPassword(u.id)}>Set</Btn>
                      <Btn onClick={()=>{ setResetId(null); setNewPass('') }}>✕</Btn>
                    </>
                  ) : (
                    isAdmin && <Btn onClick={()=>setResetId(u.id)}>Reset pwd</Btn>
                  )}
                  {isAdmin && (
                    <Btn onClick={()=>handleToggleActive(u)}
                      style={{ color:'var(--danger)', borderColor:'var(--danger)' }}>
                      Deactivate
                    </Btn>
                  )}
                </div>
              </Td>
            </Tr>
          ))}
        />
      </Card>

      {/* Inactive users */}
      {inactive.length > 0 && (
        <Card>
          <CardTitle>Inactive / Deactivated</CardTitle>
          <Table
            heads={['User','Role','Action']}
            empty=""
            rows={inactive.map(u => (
              <Tr key={u.id}>
                <Td style={{ opacity:.6 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                    <Avatar name={u.name} size={26} />
                    <div style={{ fontSize:13 }}>{u.name} <span style={{ color:'var(--muted)', fontSize:11 }}>{u.email}</span></div>
                  </div>
                </Td>
                <Td><Badge>{u.role}</Badge></Td>
                <Td>
                  {isAdmin && (
                    <Btn variant="primary" onClick={()=>handleToggleActive(u)}>Reactivate</Btn>
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
