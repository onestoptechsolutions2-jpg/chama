import { useState } from 'react'

const BASE = import.meta.env.VITE_API_URL || ''

async function superFetch(path, method = 'GET', body = null, secret) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Super-Secret': secret,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

export default function SuperAdminPage() {
  const [secret, setSecret]   = useState('')
  const [authed, setAuthed]   = useState(false)
  const [stats, setStats]     = useState(null)
  const [groups, setGroups]   = useState([])
  const [tab, setTab]         = useState('stats')
  const [form, setForm]       = useState({
    group_name:'', group_type:'chama', description:'',
    admin_name:'', admin_email:'', admin_phone:'', admin_password:'',
    is_public:true, require_approval:true,
  })
  const [loading, setLoading] = useState(false)
  const [msg, setMsg]         = useState(null)

  const set = (k,v) => setForm(f => ({ ...f, [k]: v }))
  const notify = (text, type='ok') => { setMsg({text,type}); setTimeout(()=>setMsg(null),4000) }

  const authenticate = async () => {
    setLoading(true)
    try {
      const s = await superFetch('/api/super-admin/stats','GET',null,secret)
      const g = await superFetch('/api/super-admin/groups','GET',null,secret)
      setStats(s); setGroups(g); setAuthed(true)
    } catch(e) { notify(e.message,'err') } finally { setLoading(false) }
  }

  const createGroup = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await superFetch('/api/super-admin/groups','POST',form,secret)
      notify(res.message)
      setForm({ group_name:'',group_type:'chama',description:'',admin_name:'',admin_email:'',admin_phone:'',admin_password:'',is_public:true,require_approval:true })
      const g = await superFetch('/api/super-admin/groups','GET',null,secret)
      setGroups(g)
    } catch(e) { notify(e.message,'err') } finally { setLoading(false) }
  }

  if (!authed) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)', fontFamily:'var(--font)' }}>
        <div style={{ width:360, background:'var(--card)', border:'1px solid var(--border)', borderRadius:14, padding:32 }}>
          <h2 style={{ margin:'0 0 6px', fontWeight:800, color:'var(--text)' }}>🔐 Super Admin</h2>
          <p style={{ margin:'0 0 24px', color:'var(--muted)', fontSize:13 }}>Enter the super-admin secret to continue.</p>
          <input
            type="password"
            value={secret}
            onChange={e => setSecret(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && authenticate()}
            placeholder="Super admin secret"
            style={{ width:'100%', boxSizing:'border-box', padding:'11px 13px', borderRadius:9, border:'1.5px solid var(--border)', background:'var(--bg)', color:'var(--text)', fontSize:14, marginBottom:14 }}
          />
          {msg && <div style={{ fontSize:13, color: msg.type==='err' ? '#dc2626':'#16a34a', marginBottom:12 }}>{msg.text}</div>}
          <button onClick={authenticate} disabled={loading || !secret} style={{
            width:'100%', padding:'12px', background:'var(--accent)', color:'#fff',
            border:'none', borderRadius:9, fontWeight:700, fontSize:15, cursor:'pointer',
          }}>
            {loading ? 'Authenticating…' : 'Continue'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth:1000, margin:'0 auto', padding:'32px 24px', fontFamily:'var(--font)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:28 }}>
        <div>
          <h1 style={{ margin:0, fontSize:24, fontWeight:800, color:'var(--text)' }}>🔐 Super Admin</h1>
          <p style={{ margin:'4px 0 0', color:'var(--muted)', fontSize:13 }}>Platform-wide management</p>
        </div>
        <button onClick={() => setAuthed(false)} style={{ fontSize:13, color:'var(--muted)', background:'none', border:'1px solid var(--border)', borderRadius:7, padding:'6px 12px', cursor:'pointer' }}>
          Lock
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:28 }}>
          {[['Groups', stats.groups], ['Active users', stats.users], ['Memberships', stats.active_memberships]].map(([k,v]) => (
            <div key={k} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 20px' }}>
              <div style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:1, color:'var(--muted)', marginBottom:6 }}>{k}</div>
              <div style={{ fontSize:28, fontWeight:800, color:'var(--accent)' }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:24, background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:4, width:'fit-content' }}>
        {['stats','create'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding:'7px 18px', borderRadius:7, border:'none', cursor:'pointer', fontWeight:600, fontSize:13,
            background: tab===t ? 'var(--accent)' : 'transparent',
            color: tab===t ? '#fff' : 'var(--muted)',
          }}>{t === 'stats' ? 'All groups' : 'Create group'}</button>
        ))}
      </div>

      {msg && (
        <div style={{ padding:'10px 16px', borderRadius:8, marginBottom:16, fontSize:13, fontWeight:600,
          background: msg.type==='err' ? '#fef2f2':'#f0fdf4',
          color: msg.type==='err' ? '#dc2626':'#16a34a',
          border: `1px solid ${msg.type==='err'?'#fecaca':'#bbf7d0'}`,
        }}>{msg.text}</div>
      )}

      {tab === 'stats' && (
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'var(--bg)', borderBottom:'1px solid var(--border)' }}>
                {['#','Name','Type','Members','Public','Created'].map(h => (
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontWeight:600, color:'var(--muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g,i) => (
                <tr key={g.id} style={{ borderBottom:'1px solid var(--border)' }}>
                  <td style={{ padding:'10px 14px', color:'var(--muted)' }}>{i+1}</td>
                  <td style={{ padding:'10px 14px', fontWeight:600, color:'var(--text)' }}>{g.name}</td>
                  <td style={{ padding:'10px 14px', textTransform:'capitalize', color:'var(--muted)' }}>{g.type}</td>
                  <td style={{ padding:'10px 14px', color:'var(--text)' }}>{g.member_count}</td>
                  <td style={{ padding:'10px 14px' }}><span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background: g.is_public?'#dcfce7':'#f3f4f6', color: g.is_public?'#16a34a':'#6b7280' }}>{g.is_public?'Yes':'No'}</span></td>
                  <td style={{ padding:'10px 14px', color:'var(--muted)' }}>{new Date(g.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'create' && (
        <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:24 }}>
          <h3 style={{ margin:'0 0 20px', fontWeight:700, color:'var(--text)' }}>Create new group</h3>
          <form onSubmit={createGroup} style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <F label="Group name *" value={form.group_name} onChange={e=>set('group_name',e.target.value)} required />
            <div>
              <label style={lbl}>Group type</label>
              <select value={form.group_type} onChange={e=>set('group_type',e.target.value)} style={selStyle}>
                <option value="chama">Chama</option>
                <option value="welfare">Welfare</option>
                <option value="hybrid">Hybrid</option>
                <option value="investment">Investment</option>
              </select>
            </div>
            <div style={{ gridColumn:'1/-1' }}>
              <F label="Description" value={form.description} onChange={e=>set('description',e.target.value)} />
            </div>
            <F label="Admin name *" value={form.admin_name} onChange={e=>set('admin_name',e.target.value)} required />
            <F label="Admin email" type="email" value={form.admin_email} onChange={e=>set('admin_email',e.target.value)} />
            <F label="Admin phone" type="tel" value={form.admin_phone} onChange={e=>set('admin_phone',e.target.value)} />
            <F label="Admin password *" type="password" value={form.admin_password} onChange={e=>set('admin_password',e.target.value)} required />
            <div style={{ gridColumn:'1/-1', display:'flex', gap:12, marginTop:8 }}>
              <button type="submit" disabled={loading} style={{
                background:'var(--accent)', color:'#fff', border:'none', borderRadius:9, padding:'11px 24px', fontWeight:700, fontSize:14, cursor:'pointer',
              }}>
                {loading ? 'Creating…' : 'Create group'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function F({ label, ...props }) {
  return (
    <div>
      <label style={lbl}>{label}</label>
      <input {...props} style={{ width:'100%', boxSizing:'border-box', padding:'10px 12px', borderRadius:8, border:'1.5px solid var(--border)', background:'var(--bg)', color:'var(--text)', fontSize:14 }} />
    </div>
  )
}
const lbl = { display:'block', fontSize:13, fontWeight:600, color:'var(--text)', marginBottom:6 }
const selStyle = { width:'100%', padding:'10px 12px', borderRadius:8, border:'1.5px solid var(--border)', background:'var(--bg)', color:'var(--text)', fontSize:14 }
