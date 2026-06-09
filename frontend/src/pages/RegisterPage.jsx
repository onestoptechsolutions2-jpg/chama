import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function RegisterPage() {
  const { register } = useAuth()
  const nav = useNavigate()
  const [form, setForm] = useState({ name:'', email:'', phone:'', password:'' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.name)     { setError('Name is required'); return }
    if (!form.email && !form.phone) { setError('Email or phone required'); return }
    if (form.password.length < 6)   { setError('Password must be at least 6 characters'); return }
    setLoading(true)
    try {
      await register(form)
      nav('/')  // go to landing/groups to pick a group
    } catch (e) {
      setError(e.response?.data?.error || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', fontFamily:'var(--font)', background:'var(--bg)' }}>
      {/* Brand panel */}
      <div style={{
        width:'38%', minWidth:0, display:'none',
        background:'linear-gradient(150deg,#183d23 0%,#2d5a3d 55%,#3d7a52 100%)',
        padding:'48px 40px', flexDirection:'column', justifyContent:'center',
        '@media(minWidth:768px)': { display:'flex' },
      }} className="reg-brand">
        <div style={{ color:'#fff' }}>
          <div style={{ fontSize:28, fontWeight:800, marginBottom:12, letterSpacing:-0.5 }}>🤝 Chama Manager</div>
          <p style={{ opacity:.8, fontSize:15, lineHeight:1.7 }}>
            Join Kenya's leading chama management platform. Track savings, loans, and MGR rotations — all in one place.
          </p>
          <div style={{ marginTop:36, display:'flex', flexDirection:'column', gap:14 }}>
            {['Free to join', 'Multiple groups', 'Mobile-friendly PWA', 'Secure & private'].map(f => (
              <div key={f} style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:20, height:20, borderRadius:'50%', background:'rgba(255,255,255,.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11 }}>✓</div>
                <span style={{ color:'rgba(255,255,255,.85)', fontSize:14 }}>{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'32px 24px' }}>
        <div style={{ width:'100%', maxWidth:400 }}>
          <div style={{ marginBottom:32 }}>
            <h1 style={{ margin:'0 0 6px', fontSize:26, fontWeight:800, color:'var(--text)', letterSpacing:-.5 }}>Create account</h1>
            <p style={{ margin:0, color:'var(--muted)', fontSize:14 }}>
              Already have one? <Link to="/login" style={{ color:'var(--accent)', fontWeight:600, textDecoration:'none' }}>Sign in</Link>
            </p>
          </div>

          {error && (
            <div style={{
              background:'#fef2f2', borderLeft:'3px solid #dc2626', padding:'10px 14px',
              borderRadius:8, fontSize:13, color:'#dc2626', marginBottom:20,
            }}>{error}</div>
          )}

          <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <Field label="Full name *" type="text" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Alice Wanjiku" />
            <Field label="Email" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="alice@email.com" />
            <Field label="Phone" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="07xx xxx xxx" />
            <div>
              <label style={labelStyle}>Password *</label>
              <div style={{ position:'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  placeholder="Min. 6 characters"
                  style={{ ...inputStyle, paddingRight:44 }}
                />
                <button type="button" onClick={() => setShowPass(s => !s)} style={{
                  position:'absolute', right:10, top:'50%', transform:'translateY(-50%)',
                  background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:18,
                }}>
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} style={{
              marginTop:4, background:'var(--accent)', color:'#fff', border:'none',
              borderRadius:10, padding:'13px', fontWeight:700, fontSize:15, cursor:'pointer',
              opacity: loading ? .7 : 1,
            }}>
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
          <p style={{ textAlign:'center', fontSize:12, color:'var(--muted)', marginTop:20, lineHeight:1.5 }}>
            By registering you agree to our terms of service.
          </p>
        </div>
      </div>
    </div>
  )
}

function Field({ label, ...props }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input {...props} style={inputStyle} />
    </div>
  )
}
const labelStyle = { display:'block', fontSize:13, fontWeight:600, color:'var(--text)', marginBottom:6 }
const inputStyle = {
  width:'100%', boxSizing:'border-box', padding:'11px 13px', borderRadius:9,
  border:'1.5px solid var(--border)', background:'var(--bg)', color:'var(--text)',
  fontSize:14, outline:'none', transition:'border-color .15s',
}
