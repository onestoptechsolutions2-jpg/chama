import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function Avatar({ name='?', size=28 }) {
  const ini = (name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()
  return (
    <div style={{
      width:size, height:size, borderRadius:'50%',
      background:'rgba(255,255,255,0.15)', color:'#fff',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:size*0.32, fontWeight:700, flexShrink:0,
    }}>{ini}</div>
  )
}

const navLink = ({ isActive }) => ({
  display:'flex', alignItems:'center', gap:9, padding:'8px 10px',
  borderRadius:10, cursor:'pointer', fontSize:13, marginBottom:1,
  textDecoration:'none', transition:'all .15s',
  background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
  color:      isActive ? '#fff'                   : 'rgba(255,255,255,0.55)',
  fontWeight: isActive ? 500                      : 400,
})

function NavItem({ to, icon, label, end }) {
  return (
    <NavLink to={to} style={navLink} end={end}>
      <span style={{ fontSize:15, width:18, textAlign:'center', flexShrink:0 }}>{icon}</span>
      {label}
    </NavLink>
  )
}

function Divider({ label }) {
  return (
    <div style={{
      fontSize:9.5, fontWeight:600, color:'rgba(255,255,255,0.3)',
      textTransform:'uppercase', letterSpacing:'1px',
      padding:'14px 10px 5px',
    }}>
      {label}
    </div>
  )
}

export default function Layout({ children, groupType='chama' }) {
  const { auth, logout, isAdmin, isStaff } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => { logout(); navigate('/login') }

  const showMgr     = ['chama','hybrid'].includes(groupType)
  const showWelfare = ['welfare','hybrid'].includes(groupType)
  const showLoans   = ['chama','hybrid','selfhelp'].includes(groupType)
  const showProj    = ['selfhelp','hybrid'].includes(groupType)

  const userName = auth?.user?.name || 'User'
  const userRole = auth?.user?.role || 'member'

  const typeLabel = {
    chama:'Chama', welfare:'Welfare', hybrid:'Hybrid', selfhelp:'Self Help'
  }[groupType] || groupType

  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>

      {/* ── Sidebar ── */}
      <aside style={{
        width:220, position:'fixed', top:0, bottom:0, left:0, zIndex:100,
        background:'linear-gradient(180deg, #1e4d2b 0%, #2d5a3d 100%)',
        display:'flex', flexDirection:'column',
        boxShadow:'2px 0 12px rgba(0,0,0,0.12)',
      }}>

        {/* Logo */}
        <div style={{ padding:'22px 16px 16px', borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#fff', letterSpacing:'.2px' }}>🤝 Chama Manager</div>
          <div style={{
            display:'inline-flex', alignItems:'center', gap:5, marginTop:6,
            background:'rgba(255,255,255,0.10)', borderRadius:100,
            padding:'2px 9px', fontSize:10, color:'rgba(255,255,255,0.65)', fontWeight:500,
          }}>
            <span style={{ width:5, height:5, borderRadius:'50%', background:'#86efac', display:'inline-block' }} />
            {typeLabel} Group
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex:1, padding:'8px 8px', overflowY:'auto' }}>
          {isStaff ? (
            <>
              <Divider label="Overview" />
              <NavItem to="/"         icon="📊" label="Dashboard" end />

              <Divider label="Management" />
              <NavItem to="/members"  icon="👥" label="Members" />
              {showLoans   && <NavItem to="/loans"    icon="💰" label="Loans" />}
              {showMgr     && <NavItem to="/mgr"      icon="🔄" label="Merry-Go-Round" />}
              <NavItem to="/fines"    icon="⚠️" label="Fines" />
              {showWelfare && <NavItem to="/welfare"  icon="🏥" label="Welfare" />}
              {showProj    && <NavItem to="/projects" icon="🏗️" label="Projects" />}
              <NavItem to="/meetings" icon="📅" label="Meetings" />

              <Divider label="Settings" />
              <NavItem to="/rules"    icon="📋" label="Rules" />
              {isAdmin && <NavItem to="/users" icon="🔑" label="Users" />}
            </>
          ) : (
            <>
              <Divider label="My Account" />
              <NavItem to="/"         icon="👤" label="My Profile" end />
              {showLoans   && <NavItem to="/my-loan"  icon="💰" label="My Loan" />}
              {showMgr     && <NavItem to="/mgr"      icon="🔄" label="Merry-Go-Round" />}
              {showWelfare && <NavItem to="/welfare"  icon="🏥" label="Welfare" />}
              {showProj    && <NavItem to="/projects" icon="🏗️" label="Projects" />}
              <NavItem to="/rules"    icon="📋" label="Rules" />
            </>
          )}
        </nav>

        {/* Footer */}
        <div style={{ padding:'10px 8px', borderTop:'1px solid rgba(255,255,255,0.08)' }}>
          <div style={{
            display:'flex', alignItems:'center', gap:9,
            padding:'8px 10px', borderRadius:10,
            background:'rgba(255,255,255,0.07)',
          }}>
            <Avatar name={userName} size={28} />
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:600, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{userName}</div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)', textTransform:'capitalize' }}>{userRole}</div>
            </div>
            <button onClick={handleLogout} title="Sign out" style={{
              background:'none', border:'none', cursor:'pointer',
              color:'rgba(255,255,255,0.4)', fontSize:14, padding:2, lineHeight:1, flexShrink:0,
            }}>↩</button>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main style={{ marginLeft:220, flex:1, padding:28, maxWidth:'100%', minWidth:0 }}>
        {children}
      </main>
    </div>
  )
}
