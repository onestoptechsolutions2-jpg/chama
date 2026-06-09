import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getPendingMembers, reviewMembership } from '../api'
import { PageHeader, Card, Btn, Avatar, Toast } from '../components/UI'
import { useAuth } from '../context/AuthContext'

export default function PendingMembersPage() {
  const { activeGroup } = useAuth()
  const qc = useQueryClient()
  const gid = activeGroup?.group_id

  const { data: pending=[], isLoading } = useQuery({
    queryKey:['pending-members', gid],
    queryFn: () => getPendingMembers(gid),
    enabled: !!gid,
  })

  const mut = useMutation({
    mutationFn: ({ mid, action }) => reviewMembership(gid, mid, { action }),
    onSuccess: () => qc.invalidateQueries({ queryKey:['pending-members'] }),
  })

  const [toast, setToast] = useState(null)
  const notify = (msg, type='ok') => { setToast({msg,type}); setTimeout(()=>setToast(null),3000) }

  const review = async (mid, action) => {
    try {
      await mut.mutateAsync({ mid, action })
      notify(action === 'approve' ? 'Member approved!' : 'Request rejected')
    } catch(e) { notify(e.response?.data?.error || 'Error','err') }
  }

  return (
    <div>
      <PageHeader title="Join Requests" sub={`${pending.length} pending`} />
      {isLoading ? (
        <div style={{ textAlign:'center', padding:40, color:'var(--muted)' }}>Loading…</div>
      ) : pending.length === 0 ? (
        <Card>
          <div style={{ textAlign:'center', padding:'32px 0', color:'var(--muted)' }}>
            <div style={{ fontSize:36, marginBottom:12 }}>✅</div>
            <div style={{ fontWeight:600 }}>No pending requests</div>
            <div style={{ fontSize:13, marginTop:4 }}>All join requests have been reviewed.</div>
          </div>
        </Card>
      ) : (
        <Card>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {pending.map(p => (
              <div key={p.id} style={{
                display:'flex', alignItems:'center', gap:14, padding:'14px 16px',
                background:'var(--bg)', borderRadius:10, border:'1px solid var(--border)',
              }}>
                <Avatar name={p.name} size={42} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:15, color:'var(--text)' }}>{p.name}</div>
                  <div style={{ fontSize:12, color:'var(--muted)' }}>{p.email || p.phone}</div>
                  {p.join_message && (
                    <div style={{ fontSize:12, color:'var(--text)', marginTop:4, fontStyle:'italic', opacity:.75 }}>
                      "{p.join_message}"
                    </div>
                  )}
                  <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
                    Requested {new Date(p.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                  <Btn variant="primary" onClick={() => review(p.id,'approve')} disabled={mut.isPending}>
                    Approve
                  </Btn>
                  <Btn onClick={() => review(p.id,'reject')} disabled={mut.isPending}>
                    Reject
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
