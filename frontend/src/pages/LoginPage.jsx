import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate  = useNavigate()

  const [url,     setUrl]     = useState(import.meta.env.VITE_STRAPI_URL || '')
  const [token,   setToken]   = useState('')
  const [role,    setRole]    = useState('treasurer')
  const [members, setMembers] = useState([])
  const [selId,   setSelId]   = useState('')
  const [selName, setSelName] = useState('')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const fetchMembers = async (baseUrl, tok) => {
    try {
      const r = await fetch(`${baseUrl}/api/members?pagination[pageSize]=100&sort=name:asc`, { headers: { Authorization:`Bearer ${tok}` } })
      const d = await r.json()
      const list = d.data || []
      setMembers(list)
      if (list.length) { setSelId(list[0].documentId); setSelName(list[0].name) }
    } catch {}
  }

  const handleRole = async (r) => {
    setRole(r)
    if (r === 'member' && url && token) await fetchMembers(url, token)
  }

  const handleConnect = async () => {
    setError('')
    if (!token) { setError('Enter your API token.'); return }
    setLoading(true)
    // Use configured VITE_STRAPI_URL (set at build time) or the manually entered URL
    const base = url || import.meta.env.VITE_STRAPI_URL || ''
    try {
      // Store token so axios interceptor picks it up
      localStorage.setItem('chama_token', token)
      const r = await fetch(`${base || ''}/api/members?pagination[pageSize]=1`, {
        headers: { Authorization:`Bearer ${token}` }
      })
      if (!r.ok) throw new Error(`Server returned ${r.status}. Check token and CORS settings.`)

      login({ token, role, memberDocId: role==='member'?selId:null, memberName: role==='member'?selName:'Treasurer' })
      navigate('/')
    } catch(e) {
      setError(e.message)
      localStorage.removeItem('chama_token')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)' }}>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r-lg)', padding:36, width:400, boxShadow:'0 4px 24px rgba(0,0,0,.08)' }}>
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ fontSize:40, marginBottom:8 }}>🤝</div>
          <h2 style={{ fontSize:20, fontWeight:600 }}>Chama Manager</h2>
          <p style={{ color:'var(--muted)', fontSize:13, marginTop:4 }}>
            Backend: <code style={{ fontSize:11, background:'var(--surface2)', padding:'2px 6px', borderRadius:4 }}>chama.laitor.co.ke</code>
          </p>
        </div>

        <div style={{ marginBottom:12 }}>
          <label style={{ display:'block', fontSize:12, fontWeight:500, color:'var(--muted)', marginBottom:5 }}>API Token</label>
          <input type="password" placeholder="Paste your Strapi API token"
            value={token} onChange={e=>setToken(e.target.value)}
            style={{ width:'100%', padding:'9px 11px', border:'1px solid var(--border)', borderRadius:'var(--r)', fontFamily:"'DM Mono',monospace", fontSize:12, outline:'none' }} />
        </div>

        <div style={{ marginBottom:16 }}>
          <label style={{ display:'block', fontSize:12, fontWeight:500, color:'var(--muted)', marginBottom:8 }}>Sign in as</label>
          <div style={{ display:'flex', gap:8 }}>
            {['treasurer','member'].map(r => (
              <button key={r} onClick={()=>handleRole(r)} style={{
                flex:1, padding:9, border:'1px solid', borderRadius:'var(--r)', fontFamily:'inherit',
                fontSize:13, fontWeight:500, cursor:'pointer',
                borderColor: role===r?'var(--accent)':'var(--border)',
                background:  role===r?'var(--accent-lt)':'var(--surface)',
                color:       role===r?'var(--accent)':'var(--muted)',
              }}>
                {r==='treasurer'?'🛡 Treasurer':'👤 Member'}
              </button>
            ))}
          </div>
        </div>

        {role==='member' && members.length>0 && (
          <div style={{ marginBottom:14 }}>
            <label style={{ display:'block', fontSize:12, fontWeight:500, color:'var(--muted)', marginBottom:5 }}>Your name</label>
            <select value={selId}
              onChange={e=>{ setSelId(e.target.value); setSelName(e.target.options[e.target.selectedIndex].text) }}
              style={{ width:'100%', padding:'9px 11px', border:'1px solid var(--border)', borderRadius:'var(--r)', fontFamily:'inherit', fontSize:13, outline:'none' }}>
              {members.map(m => <option key={m.documentId} value={m.documentId}>{m.name}</option>)}
            </select>
          </div>
        )}

        {error && <p style={{ color:'var(--danger)', fontSize:12, marginBottom:12 }}>{error}</p>}

        <button onClick={handleConnect} disabled={loading}
          style={{ width:'100%', padding:10, background:'var(--accent)', color:'#fff', border:'none', borderRadius:'var(--r)', fontFamily:'inherit', fontSize:14, fontWeight:500, cursor:loading?'wait':'pointer' }}>
          {loading ? 'Connecting...' : 'Launch App'}
        </button>

        <p style={{ fontSize:11, color:'var(--muted)', textAlign:'center', marginTop:16, lineHeight:1.6 }}>
          Token stored in your browser only. Never share it.
        </p>
      </div>
    </div>
  )
}
