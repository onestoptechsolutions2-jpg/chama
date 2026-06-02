import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const style = {
  wrap:    { display:'flex', minHeight:'100vh' },
  sidebar: { width:220, background:'var(--surface)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', position:'fixed', top:0, bottom:0, left:0, zIndex:100 },
  logo:    { padding:'20px 18px 14px', borderBottom:'1px solid var(--border)' },
  logoName:{ fontSize:15, fontWeight:600 },
  logoSub: { fontSize:11, color:'var(--muted)', marginTop:2 },
  nav:     { flex:1, padding:'10px', overflowY:'auto' },
  sec:     { fontSize:10, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.8px', padding:'14px 8px 6px' },
  foot:    { padding:'12px 10px', borderBottom:'1px solid var(--border)' },
  chip:    { display:'flex', alignItems:'center', gap:8, padding:'8px 10px', borderRadius:'var(--r)', background:'var(--surface2)', cursor:'pointer' },
  main:    { marginLeft:220, flex:1, padding:28 },
}

const navStyle = ({ isActive }) => ({
  display:'flex', alignItems:'center', gap:9, padding:'8px 10px',
  borderRadius:'var(--r)', cursor:'pointer', fontSize:13, marginBottom:2,
  textDecoration:'none', transition:'all .15s',
  background: isActive ? 'var(--accent-lt)' : 'transparent',
  color:      isActive ? 'var(--accent)'    : 'var(--muted)',
  fontWeight: isActive ? 500                : 400,
})

function Avatar({ name='?', size=28 }) {
  const ini = name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()
  return <div style={{ width:size, height:size, borderRadius:'50%', background:'var(--accent-lt)', color:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*0.3, fontWeight:600, flexShrink:0 }}>{ini}</div>
}

export default function Layout({ children }) {
  const { auth, logout } = useAuth()
  const navigate = useNavigate()

  const treasurer = auth?.role === 'treasurer'

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <div style={style.wrap}>
      <aside style={style.sidebar}>
        <div style={style.logo}>
          <div style={style.logoName}>🤝 Chama Manager</div>
          <div style={style.logoSub}>June 2026 Rules</div>
        </div>

        <nav style={style.nav}>
          {treasurer ? (
            <>
              <div style={style.sec}>Overview</div>
              <NavLink to="/"        style={navStyle} end>📊 Dashboard</NavLink>
              <div style={style.sec}>Management</div>
              <NavLink to="/members" style={navStyle}>👥 Members</NavLink>
              <NavLink to="/loans"   style={navStyle}>💰 Loans</NavLink>
              <NavLink to="/mgr"     style={navStyle}>🔄 Merry-Go-Round</NavLink>
              <NavLink to="/fines"   style={navStyle}>⚠️ Fines</NavLink>
              <div style={style.sec}>Reference</div>
              <NavLink to="/rules"   style={navStyle}>📋 Rules</NavLink>
            </>
          ) : (
            <>
              <NavLink to="/"        style={navStyle} end>👤 My Profile</NavLink>
              <NavLink to="/my-loan" style={navStyle}>💰 My Loan</NavLink>
              <NavLink to="/mgr"     style={navStyle}>🔄 MGR Schedule</NavLink>
              <NavLink to="/rules"   style={navStyle}>📋 Rules</NavLink>
            </>
          )}
        </nav>

        <div style={style.foot}>
          <div style={style.chip} onClick={handleLogout} title="Click to sign out">
            <Avatar name={auth?.memberName || 'Treasurer'} />
            <div>
              <div style={{ fontSize:12, fontWeight:500 }}>{auth?.memberName || 'Treasurer'}</div>
              <div style={{ fontSize:10, color:'var(--muted)' }}>{treasurer ? 'Admin' : 'Member'} · Sign out</div>
            </div>
          </div>
        </div>
      </aside>

      <main style={style.main}>{children}</main>
    </div>
  )
}
