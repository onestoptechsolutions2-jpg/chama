import { useState } from 'react'
import { useWelfare, useMembers, useCreateClaim, useUpdateClaim, ksh } from '../hooks/useChama'
import { useAuth } from '../context/AuthContext'
import { PageHeader, Card, CardTitle, Table, Tr, Td, Avatar, Badge, Btn, Input, Sel, Grid2, Loader, Toast } from '../components/UI'

const CLAIM_TYPES = ['medical','bereavement','emergency','education','maternity','disability','other']
const REL_TYPES   = ['self','spouse','child','parent','sibling','other']

const statusVariant = s => ({ pending:'warn', under_review:'info', approved:'ok', rejected:'danger', disbursed:'ok' }[s] || 'info')

export default function Welfare() {
  const { data: claims=[], isLoading } = useWelfare()
  const { data: members=[] }           = useMembers()
  const createClaim = useCreateClaim()
  const updateClaim = useUpdateClaim()
  const { isStaff } = useAuth()

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ member_id:'', claim_type:'medical', amount_requested:'', description:'', beneficiary_name:'', beneficiary_rel:'self' })
  const [toast, setToast] = useState(null)

  const notify = (msg, type='ok') => { setToast({msg,type}); setTimeout(()=>setToast(null),3000) }
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}))

  const handleSubmit = async () => {
    if (!form.member_id || !form.amount_requested) { notify('Member and amount required','err'); return }
    try {
      await createClaim.mutateAsync({ ...form, amount_requested: Number(form.amount_requested) })
      notify('Claim submitted!')
      setForm({ member_id:'', claim_type:'medical', amount_requested:'', description:'', beneficiary_name:'', beneficiary_rel:'self' })
      setShowForm(false)
    } catch(e) { notify('Failed: ' + (e?.response?.data?.error || e.message), 'err') }
  }

  const handleStatus = async (id, status, amount_approved) => {
    try {
      await updateClaim.mutateAsync({ id, data: { status, amount_approved } })
      notify(`Claim ${status}`)
    } catch(e) { notify('Failed', 'err') }
  }

  if (isLoading) return <Loader />

  const pending   = claims.filter(c => c.status === 'pending')
  const processed = claims.filter(c => c.status !== 'pending')

  return (
    <div>
      <PageHeader title="Welfare Claims" sub={`${pending.length} pending · ${claims.length} total`}
        action={<Btn variant="primary" onClick={()=>setShowForm(s=>!s)}>+ New Claim</Btn>} />

      {showForm && (
        <Card>
          <CardTitle>Submit Welfare Claim</CardTitle>
          <Grid2>
            <Sel label="Member *" value={form.member_id} onChange={set('member_id')}>
              <option value="">— Select member —</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Sel>
            <Sel label="Claim Type" value={form.claim_type} onChange={set('claim_type')}>
              {CLAIM_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
            </Sel>
          </Grid2>
          <Grid2>
            <Input label="Amount Requested (Ksh) *" type="number" value={form.amount_requested} onChange={set('amount_requested')} />
            <Sel label="Beneficiary Relationship" value={form.beneficiary_rel} onChange={set('beneficiary_rel')}>
              {REL_TYPES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
            </Sel>
          </Grid2>
          <Input label="Beneficiary Name (if not self)" value={form.beneficiary_name} onChange={set('beneficiary_name')} placeholder="Leave blank if claiming for self" />
          <div style={{ marginTop:12 }}>
            <label style={{ display:'block', fontSize:12, fontWeight:500, color:'var(--muted)', marginBottom:5 }}>Description / Reason</label>
            <textarea value={form.description} onChange={set('description')} rows={3}
              style={{ width:'100%', padding:'8px 10px', border:'1px solid var(--border)', borderRadius:'var(--r)', fontFamily:'inherit', fontSize:13, resize:'vertical', boxSizing:'border-box' }} />
          </div>
          <div style={{ display:'flex', gap:8, marginTop:12 }}>
            <Btn variant="primary" onClick={handleSubmit} disabled={createClaim.isPending}>
              {createClaim.isPending ? 'Submitting...' : 'Submit Claim'}
            </Btn>
            <Btn onClick={()=>setShowForm(false)}>Cancel</Btn>
          </div>
        </Card>
      )}

      {pending.length > 0 && (
        <Card>
          <CardTitle>Pending Review</CardTitle>
          <Table
            heads={['Member','Type','Requested','Beneficiary','Description', isStaff?'Actions':'']}
            empty="No pending claims"
            rows={pending.map(c => (
              <Tr key={c.id}>
                <Td><div style={{ display:'flex', alignItems:'center', gap:8 }}><Avatar name={c.member_name} size={28}/>{c.member_name}</div></Td>
                <Td><Badge variant="info">{c.claim_type}</Badge></Td>
                <Td mono>{ksh(c.amount_requested)}</Td>
                <Td>{c.beneficiary_rel !== 'self' ? `${c.beneficiary_rel}: ${c.beneficiary_name||'—'}` : 'Self'}</Td>
                <Td style={{ maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.description || '—'}</Td>
                {isStaff && (
                  <Td>
                    <div style={{ display:'flex', gap:6 }}>
                      <Btn variant="primary" onClick={()=>handleStatus(c.id,'approved', c.amount_requested)}>Approve</Btn>
                      <Btn onClick={()=>handleStatus(c.id,'rejected')}>Reject</Btn>
                    </div>
                  </Td>
                )}
              </Tr>
            ))}
          />
        </Card>
      )}

      <Card>
        <CardTitle>All Claims</CardTitle>
        <Table
          heads={['Member','Type','Requested','Approved','Status','Date']}
          empty="No claims yet"
          rows={claims.map(c => (
            <Tr key={c.id}>
              <Td><div style={{ display:'flex', alignItems:'center', gap:8 }}><Avatar name={c.member_name} size={28}/>{c.member_name}</div></Td>
              <Td>{c.claim_type}</Td>
              <Td mono>{ksh(c.amount_requested)}</Td>
              <Td mono>{c.amount_approved ? ksh(c.amount_approved) : '—'}</Td>
              <Td><Badge variant={statusVariant(c.status)}>{c.status.replace('_',' ')}</Badge></Td>
              <Td>{new Date(c.created_at).toLocaleDateString('en-KE')}</Td>
            </Tr>
          ))}
        />
      </Card>

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
