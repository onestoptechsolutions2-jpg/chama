import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPublicGroups, requestJoin } from '../api'
import { useAuth } from '../context/AuthContext'

export default function LandingPage() {
  const { auth } = useAuth()
  const nav = useNavigate()
  const [groups, setGroups]   = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast]     = useState(null)

  useEffect(() => {
    getPublicGroups().then(setGroups).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const notify = (msg, type = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const handleJoin = async (group) => {
    if (!auth) { nav('/register?next=/groups'); return }
    try {
      const res = await requestJoin(group.id, {})
      notify(res.message)
    } catch (e) {
      notify(e.response?.data?.error || 'Error joining group', 'err')
    }
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', fontFamily:'var(--font)' }}>
      {/* Hero */}
      <div style={{
        background:'linear-gradient(135deg,#183d23 0%,#2d5a3d 60%,#3d7a52 100%)',
        padding:'0', color:'#fff',
      }}>
        <nav style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 24px', maxWidth:1100, margin:'0 auto' }}>
          <div style={{ fontWeight:700, fontSize:20, letterSpacing:-0.5 }}>🤝 Chama Manager</div>
          <div style={{ display:'flex', gap:10 }}>
            {auth ? (
              <button onClick={() => nav('/dashboard')} style={btnStyle('white')}>Dashboard →</button>
            ) : (
              <>
                <button onClick={() => nav('/login')}    style={btnStyle('ghost')}>Sign in</button>
                <button onClick={() => nav('/register')} style={btnStyle('white')}>Join free</button>
              </>
            )}
          </div>
        </nav>
        <div style={{ textAlign:'center', padding:'60px 24px 72px', maxWidth:700, margin:'0 auto' }}>
          <div style={{ fontSize:13, fontWeight:600, letterSpacing:2, opacity:.7, textTransform:'uppercase', marginBottom:16 }}>Chama Management Platform</div>
          <h1 style={{ fontSize:'clamp(28px,5vw,52px)', fontWeight:800, lineHeight:1.1, margin:'0 0 20px', letterSpacing:-1 }}>
            Manage your chama<br />with confidence
          </h1>
          <p style={{ fontSize:17, opacity:.8, maxWidth:480, margin:'0 auto 32px', lineHeight:1.6 }}>
            Track savings, loans, MGR rotations and welfare — built for Kenyan savings groups.
          </p>
          <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
            <button onClick={() => nav('/register')} style={{ ...btnStyle('white'), fontSize:16, padding:'14px 28px' }}>Get started free</button>
            <button onClick={() => document.getElementById('groups-section').scrollIntoView({ behavior:'smooth' })}
              style={{ ...btnStyle('ghost'), fontSize:16, padding:'14px 28px' }}>Browse groups ↓</button>
          </div>
        </div>
      </div>

      {/* Public groups */}
      <div id="groups-section" style={{ maxWidth:1100, margin:'0 auto', padding:'48px 24px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:28 }}>
          <div>
            <h2 style={{ margin:0, fontSize:24, fontWeight:700, color:'var(--text)' }}>Open groups</h2>
            <p style={{ margin:'4px 0 0', color:'var(--muted)', fontSize:14 }}>Tap a group to request membership</p>
          </div>
          {!loading && <span style={{ fontSize:13, color:'var(--muted)', background:'var(--card)', padding:'4px 12px', borderRadius:20, border:'1px solid var(--border)' }}>{groups.length} groups</span>}
        </div>

        {loading ? (
          <div style={{ textAlign:'center', padding:60, color:'var(--muted)' }}>Loading groups…</div>
        ) : groups.length === 0 ? (
          <div style={{ textAlign:'center', padding:60, color:'var(--muted)' }}>No public groups yet.</div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(290px,1fr))', gap:16 }}>
            {groups.map(g => (
              <div key={g.id} style={{
                background:'var(--card)', border:'1px solid var(--border)', borderRadius:14,
                padding:20, cursor:'pointer', transition:'box-shadow .15s',
              }}
                onMouseEnter={e => e.currentTarget.style.boxShadow='0 4px 20px rgba(0,0,0,.09)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow='none'}
              >
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                  <div style={{
                    width:42, height:42, borderRadius:10, background:'linear-gradient(135deg,#2d5a3d,#3d7a52)',
                    display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:18,
                  }}>🤝</div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:15, color:'var(--text)' }}>{g.name}</div>
                    <div style={{ fontSize:12, color:'var(--muted)', textTransform:'capitalize' }}>{g.type}</div>
                  </div>
                </div>
                {g.description && <p style={{ fontSize:13, color:'var(--muted)', margin:'0 0 12px', lineHeight:1.5 }}>{g.description}</p>}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:12, color:'var(--muted)' }}>👥 {g.member_count} members</span>
                  <button
                    onClick={() => handleJoin(g)}
                    style={{ fontSize:13, fontWeight:600, background:'var(--accent)', color:'#fff',
                      border:'none', borderRadius:8, padding:'7px 14px', cursor:'pointer' }}
                  >
                    {g.require_approval ? 'Request to join' : 'Join now'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop:'1px solid var(--border)', padding:'24px', textAlign:'center', color:'var(--muted)', fontSize:13 }}>
        © {new Date().getFullYear()} Chama Manager · Built for Kenyan savings groups
      </div>

      {toast && (
        <div style={{
          position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)',
          background: toast.type === 'err' ? '#dc2626' : '#16a34a',
          color:'#fff', padding:'12px 20px', borderRadius:10, fontWeight:600, fontSize:14,
          boxShadow:'0 8px 24px rgba(0,0,0,.2)', zIndex:9999,
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

function btnStyle(variant) {
  const base = { border:'none', borderRadius:8, padding:'10px 18px', cursor:'pointer', fontWeight:600, fontSize:14, transition:'opacity .15s' }
  if (variant === 'white') return { ...base, background:'#fff', color:'#183d23' }
  if (variant === 'ghost') return { ...base, background:'rgba(255,255,255,.12)', color:'#fff', border:'1px solid rgba(255,255,255,.3)' }
  return base
}
