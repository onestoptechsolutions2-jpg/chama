import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function StatPill({ label, value, dot = '#a8d5b5' }) {
  return (
    <div style={{
      background:'rgba(255,255,255,0.09)', border:'1px solid rgba(255,255,255,0.15)',
      borderRadius:14, padding:'10px 16px', display:'flex', alignItems:'center', gap:10,
    }}>
      <div style={{ width:8, height:8, borderRadius:'50%', background:dot, flexShrink:0 }} />
      <div>
        <div style={{ fontSize:11, color:'rgba(255,255,255,0.55)', fontWeight:500 }}>{label}</div>
        <div style={{ fontSize:13, color:'#fff', fontWeight:600 }}>{value}</div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  const { login } = useAuth()
  const navigate  = useNavigate()
  const [id,       setId]       = useState('')
  const [pass,     setPass]     = useState('')
  const [show,     setShow]     = useState(false)
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  const submit = async (e) => {
    e?.preventDefault()
    setError('')
    if (!id || !pass) { setError('Email/phone and password are required'); return }
    setLoading(true)
    try {
      const isPhone = /^0\d{9}$/.test(id.trim())
      await login({ email: isPhone ? undefined : id.trim(), phone: isPhone ? id.trim() : undefined, password: pass })
      navigate('/')
    } catch (err) {
      setError(err?.response?.data?.error || 'Invalid credentials')
    } finally { setLoading(false) }
  }

  const inp = {
    width:'100%', padding:'11px 13px', border:'1.5px solid var(--border)',
    borderRadius:'var(--r)', fontFamily:'inherit', fontSize:13, outline:'none',
    background:'var(--bg)', color:'inherit', boxSizing:'border-box', transition:'border-color .15s',
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', background:'var(--bg)' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Brand panel */}
      <div style={{
        width:'42%', minWidth:300,
        background:'linear-gradient(150deg,#183d23 0%,#2d5a3d 55%,#3d7a52 100%)',
        display:'flex', flexDirection:'column', justifyContent:'space-between',
        padding:'52px 44px', position:'relative', overflow:'hidden',
      }}>
        <div style={{ position:'absolute', top:-90, right:-90, width:260, height:260, borderRadius:'50%', background:'rgba(255,255,255,0.04)' }} />
        <div style={{ position:'absolute', bottom:-50, left:-50, width:200, height:200, borderRadius:'50%', background:'rgba(255,255,255,0.04)' }} />

        <div style={{ position:'relative' }}>
          <div style={{ fontSize:38, marginBottom:14 }}>🤝</div>
          <h1 style={{ fontSize:26, fontWeight:700, color:'#fff', lineHeight:1.25 }}>Chama Manager</h1>
          <p style={{ color:'rgba(255,255,255,0.55)', fontSize:13, marginTop:10, lineHeight:1.7, maxWidth:270 }}>
            One place for your group's savings, loans, welfare, and merry-go-round. Simple, clear, and built for Kenyan chamas.
          </p>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:9, position:'relative' }}>
          <StatPill label="Savings & contributions"  value="Track every shilling"    dot="#86efac" />
          <StatPill label="Group loans"              value="With interest tracking"   dot="#fde68a" />
          <StatPill label="Merry-Go-Round"           value="Automated schedules"      dot="#93c5fd" />
          <StatPill label="Welfare claims"           value="For members & families"   dot="#f9a8d4" />
        </div>

        <p style={{ color:'rgba(255,255,255,0.25)', fontSize:11, position:'relative' }}>
          Secure · Simple · Made for Kenya
        </p>
      </div>

      {/* Form panel */}
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'40px 32px' }}>
        <form onSubmit={submit} style={{ width:'100%', maxWidth:370 }}>

          <div style={{ marginBottom:34 }}>
            <h2 style={{ fontSize:22, fontWeight:600 }}>Welcome back</h2>
            <p style={{ color:'var(--muted)', fontSize:13, marginTop:5 }}>Sign in to your group account</p>
          </div>

          <div style={{ marginBottom:14 }}>
            <label style={{ display:'block', fontSize:12, fontWeight:500, color:'var(--muted)', marginBottom:6 }}>Email or Phone number</label>
            <input type="text" placeholder="admin@chama.local or 07xxxxxxxx" value={id} onChange={e=>setId(e.target.value)}
              style={inp} autoFocus
              onFocus={e=>e.target.style.borderColor='var(--accent)'}
              onBlur={e=>e.target.style.borderColor='var(--border)'}
            />
          </div>

          <div style={{ marginBottom:22, position:'relative' }}>
            <label style={{ display:'block', fontSize:12, fontWeight:500, color:'var(--muted)', marginBottom:6 }}>Password</label>
            <input type={show?'text':'password'} placeholder="••••••••" value={pass} onChange={e=>setPass(e.target.value)}
              style={{ ...inp, paddingRight:44 }}
              onFocus={e=>e.target.style.borderColor='var(--accent)'}
              onBlur={e=>e.target.style.borderColor='var(--border)'}
            />
            <button type="button" onClick={()=>setShow(s=>!s)} tabIndex={-1}
              style={{ position:'absolute', right:12, bottom:11, background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:14, padding:0 }}>
              {show ? '🙈' : '👁️'}
            </button>
          </div>

          {error && (
            <div style={{ fontSize:12, marginBottom:16, padding:'9px 12px', background:'var(--danger-lt)', color:'var(--danger)', borderRadius:'var(--r)', borderLeft:'3px solid var(--danger)' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width:'100%', padding:'11px 0',
            background:loading?'var(--muted)':'var(--accent)', color:'#fff', border:'none',
            borderRadius:'var(--r)', fontFamily:'inherit', fontSize:14, fontWeight:600,
            cursor:loading?'wait':'pointer', transition:'background .15s',
          }}>
            {loading
              ? <span style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
                  <span style={{ display:'inline-block', width:13, height:13, border:'2px solid rgba(255,255,255,.35)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin .7s linear infinite' }} />
                  Signing in…
                </span>
              : 'Sign in →'}
          </button>

          <p style={{ fontSize:11, color:'var(--muted)', textAlign:'center', marginTop:20, lineHeight:1.7 }}>
            Don't have an account? Contact your group admin.
          </p>
        </form>
      </div>
    </div>
  )
}
