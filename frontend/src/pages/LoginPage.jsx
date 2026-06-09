import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate  = useNavigate()

  const [identifier, setIdentifier] = useState('')   // email or phone
  const [password,   setPassword]   = useState('')
  const [error,      setError]      = useState('')
  const [loading,    setLoading]    = useState(false)

  const handleSubmit = async (e) => {
    e?.preventDefault()
    setError('')
    if (!identifier || !password) { setError('Email/phone and password are required'); return }
    setLoading(true)
    try {
      const isPhone = /^0\d{9}$/.test(identifier.trim())
      await login({
        email:    isPhone ? undefined : identifier.trim(),
        phone:    isPhone ? identifier.trim() : undefined,
        password,
      })
      navigate('/')
    } catch (err) {
      setError(err?.response?.data?.error || 'Invalid credentials')
    } finally { setLoading(false) }
  }

  const inputStyle = {
    width:'100%', padding:'9px 11px',
    border:'1px solid var(--border)', borderRadius:'var(--r)',
    fontFamily:'inherit', fontSize:13, outline:'none',
    background:'var(--surface)', color:'inherit',
    boxSizing:'border-box',
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)' }}>
      <form onSubmit={handleSubmit}
        style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r-lg)', padding:36, width:380, boxShadow:'0 4px 24px rgba(0,0,0,.08)' }}>
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ fontSize:40, marginBottom:8 }}>🤝</div>
          <h2 style={{ fontSize:20, fontWeight:600 }}>Chama Manager</h2>
          <p style={{ color:'var(--muted)', fontSize:13, marginTop:4 }}>Sign in to your group</p>
        </div>

        <div style={{ marginBottom:12 }}>
          <label style={{ display:'block', fontSize:12, fontWeight:500, color:'var(--muted)', marginBottom:5 }}>
            Email or Phone
          </label>
          <input
            type="text"
            placeholder="admin@chama.local or 07xx xxx xxx"
            value={identifier}
            onChange={e => setIdentifier(e.target.value)}
            style={inputStyle}
            autoFocus
          />
        </div>

        <div style={{ marginBottom:20 }}>
          <label style={{ display:'block', fontSize:12, fontWeight:500, color:'var(--muted)', marginBottom:5 }}>
            Password
          </label>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={inputStyle}
          />
        </div>

        {error && (
          <p style={{ color:'var(--danger)', fontSize:12, marginBottom:14, padding:'8px 10px', background:'rgba(239,68,68,.08)', borderRadius:'var(--r)' }}>
            {error}
          </p>
        )}

        <button type="submit" disabled={loading}
          style={{ width:'100%', padding:10, background:'var(--accent)', color:'#fff', border:'none', borderRadius:'var(--r)', fontFamily:'inherit', fontSize:14, fontWeight:500, cursor:loading?'wait':'pointer' }}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>

        <p style={{ fontSize:11, color:'var(--muted)', textAlign:'center', marginTop:16, lineHeight:1.6 }}>
          Contact your group admin if you need access.
        </p>
      </form>
    </div>
  )
}
