import { useState } from 'react'
import { useRules, useCreateRule, useUpdateRule, useDeleteRule } from '../hooks/useChama'
import { useAuth } from '../context/AuthContext'
import { PageHeader, Card, Btn, Input, Sel, Loader, Toast } from '../components/UI'

const CATEGORIES = ['general','contributions','loans','mgr','welfare','fines','meetings','projects','other']
const CAT_COLORS  = { contributions:'var(--accent)', loans:'var(--danger)', mgr:'#8b5cf6', welfare:'#0ea5e9', fines:'var(--warn)', meetings:'var(--muted)', general:'var(--muted)', projects:'#10b981' }

export default function Rules() {
  const { data: rules=[], isLoading } = useRules()
  const createRule = useCreateRule()
  const updateRule = useUpdateRule()
  const deleteRule = useDeleteRule()
  const { isAdmin } = useAuth()

  const [showForm, setShowForm]   = useState(false)
  const [editing,  setEditing]    = useState(null)
  const [form, setForm]           = useState({ rule_number:'', category:'general', title:'', description:'', penalty_amount:'' })
  const [toast, setToast]         = useState(null)

  const notify = (msg, type='ok') => { setToast({msg,type}); setTimeout(()=>setToast(null),3000) }
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}))

  const openNew = () => { setEditing(null); setForm({ rule_number:'', category:'general', title:'', description:'', penalty_amount:'' }); setShowForm(true) }
  const openEdit = (r) => { setEditing(r.id); setForm({ rule_number:r.rule_number, category:r.category, title:r.title||'', description:r.description, penalty_amount:r.penalty_amount||'' }); setShowForm(true) }

  const handleSave = async () => {
    if (!form.description) { notify('Description is required','err'); return }
    const data = { ...form, penalty_amount: form.penalty_amount ? Number(form.penalty_amount) : null }
    try {
      if (editing) {
        await updateRule.mutateAsync({ id: editing, data })
        notify('Rule updated')
      } else {
        await createRule.mutateAsync(data)
        notify('Rule added')
      }
      setShowForm(false)
      setEditing(null)
    } catch(e) { notify('Failed: '+(e?.response?.data?.error||e.message),'err') }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Deactivate this rule?')) return
    try { await deleteRule.mutateAsync(id); notify('Rule deactivated') }
    catch { notify('Failed','err') }
  }

  // Group by category
  const grouped = rules.reduce((acc, r) => {
    const cat = r.category || 'general'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(r)
    return acc
  }, {})

  if (isLoading) return <Loader />

  return (
    <div>
      <PageHeader title="Group Rules" sub={`${rules.length} active rules`}
        action={isAdmin && <Btn variant="primary" onClick={openNew}>+ Add Rule</Btn>} />

      {showForm && (
        <Card>
          <div style={{ fontWeight:600, marginBottom:14 }}>{editing ? 'Edit Rule' : 'New Rule'}</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Input label="Rule Number" value={form.rule_number} onChange={set('rule_number')} placeholder="Auto if blank" />
            <Sel label="Category" value={form.category} onChange={set('category')}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
            </Sel>
          </div>
          <Input label="Title (optional)" value={form.title} onChange={set('title')} placeholder="Short title" />
          <div style={{ marginTop:8 }}>
            <label style={{ display:'block', fontSize:12, fontWeight:500, color:'var(--muted)', marginBottom:5 }}>Description *</label>
            <textarea value={form.description} onChange={set('description')} rows={3}
              style={{ width:'100%', padding:'8px 10px', border:'1px solid var(--border)', borderRadius:'var(--r)', fontFamily:'inherit', fontSize:13, resize:'vertical', boxSizing:'border-box' }} />
          </div>
          <Input label="Penalty Amount (Ksh, optional)" type="number" value={form.penalty_amount} onChange={set('penalty_amount')} />
          <div style={{ display:'flex', gap:8, marginTop:12 }}>
            <Btn variant="primary" onClick={handleSave}>Save</Btn>
            <Btn onClick={()=>{ setShowForm(false); setEditing(null) }}>Cancel</Btn>
          </div>
        </Card>
      )}

      {Object.entries(grouped).map(([cat, catRules]) => (
        <div key={cat} style={{ marginBottom:24 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
            <div style={{ width:4, height:16, background:CAT_COLORS[cat]||'var(--muted)', borderRadius:2 }} />
            <h3 style={{ fontSize:13, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:.5 }}>
              {cat.charAt(0).toUpperCase()+cat.slice(1)}
            </h3>
          </div>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r-lg)', padding:'4px 18px' }}>
            {catRules.map((r, i) => (
              <div key={r.id} style={{ display:'flex', gap:16, padding:'12px 0', borderBottom: i<catRules.length-1?'1px solid var(--border)':'none', alignItems:'flex-start' }}>
                <span style={{ fontFamily:"'DM Mono',monospace", fontSize:11, color:'var(--muted)', minWidth:26, marginTop:2 }}>{r.rule_number}</span>
                <div style={{ flex:1 }}>
                  {r.title && <div style={{ fontWeight:600, fontSize:13, marginBottom:2 }}>{r.title}</div>}
                  <div style={{ fontSize:13, lineHeight:1.7 }}>{r.description}</div>
                  {r.penalty_amount && (
                    <div style={{ fontSize:11, color:'var(--danger)', marginTop:4 }}>Penalty: Ksh {Number(r.penalty_amount).toLocaleString()}</div>
                  )}
                </div>
                {isAdmin && (
                  <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                    <Btn onClick={()=>openEdit(r)}>Edit</Btn>
                    <Btn onClick={()=>handleDelete(r.id)}>Remove</Btn>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {rules.length === 0 && (
        <Card><p style={{ color:'var(--muted)', fontSize:13, textAlign:'center', padding:24 }}>
          No rules added yet. {isAdmin && 'Click "+ Add Rule" to get started.'}
        </p></Card>
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
