import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { TourHelpButton } from './AppTour'

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

function NavItem({ to, icon, label, end, tourId }) {
  return (
    <NavLink to={to} style={navLink} end={end} {...(tourId ? { 'data-tour': tourId } : {})}>
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

// Group switcher dropdown
function GroupSwitcher({ groups, activeGroup, switchGroup }) {
  const [open, setOpen] = useState(false)
  if (!groups || groups.length <= 1) return null

  return (
    <div data-tour="group-switcher" style={{ position:'relative', margin:'8px 8px 4px' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width:'100%', display:'flex', alignItems:'center', gap:8,
        background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.12)',
        borderRadius:10, padding:'7px 10px', cursor:'pointer', color:'#fff',
      }}>
        <span style={{ fontSize:11 }}>🔄</span>
        <span style={{ flex:1, fontSize:12, fontWeight:600, textAlign:'left', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {activeGroup?.group_name || 'Select group'}
        </span>
        <span style={{ fontSize:10, opacity:.6 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{
          position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:200,
          background:'#1e4d2b', border:'1px solid rgba(255,255,255,0.15)',
          borderRadius:10, overflow:'hidden', boxShadow:'0 8px 24px rgba(0,0,0,.3)',
        }}>
          {groups.map(g => (
            <button key={g.group_id} onClick={() => { switchGroup(g.group_id); setOpen(false) }} style={{
              width:'100%', display:'block', textAlign:'left',
              padding:'9px 12px', background: g.group_id === activeGroup?.group_id ? 'rgba(255,255,255,0.1)' : 'transparent',
              border:'none', color:'#fff', fontSize:13, cursor:'pointer',
              borderBottom:'1px solid rgba(255,255,255,0.05)',
            }}>
              <span style={{ fontWeight:600 }}>{g.group_name}</span>
              <span style={{ fontSize:10, opacity:.55, marginLeft:6, textTransform:'capitalize' }}>{g.group_type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// PWA install banner
function InstallBanner() {
  const [deferredPrompt, setDeferred] = useState(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (localStorage.getItem('pwa_dismissed')) return
    const handler = (e) => {
      e.preventDefault()
      setDeferred(e)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const install = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferred(null)
    setVisible(false)
    localStorage.setItem('pwa_dismissed', '1')
  }

  const dismiss = () => {
    setVisible(false)
    localStorage.setItem('pwa_dismissed', '1')
  }

  if (!visible) return null

  return (
    <div style={{
      position:'fixed', bottom:20, left:'50%', transform:'translateX(-50%)',
      background:'#1e4d2b', color:'#fff', borderRadius:14, padding:'12px 20px',
      display:'flex', alignItems:'center', gap:14, zIndex:999,
      boxShadow:'0 8px 32px rgba(0,0,0,.25)', border:'1px solid rgba(255,255,255,.12)',
      maxWidth:360, width:'calc(100% - 40px)',
    }}>
      <span style={{ fontSize:24 }}>📲</span>
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:700, fontSize:13 }}>Install Chama Manager</div>
        <div style={{ fontSize:12, opacity:.7 }}>Add to home screen for quick access</div>
      </div>
      <button onClick={install} style={{
        background:'#fff', color:'#1e4d2b', border:'none', borderRadius:8,
        padding:'6px 12px', fontWeight:700, fontSize:12, cursor:'pointer',
      }}>Install</button>
      <button onClick={dismiss} style={{
        background:'none', border:'none', color:'rgba(255,255,255,.5)',
        fontSize:18, cursor:'pointer', padding:0, lineHeight:1,
      }}>×</button>
    </div>
  )
}

export default function Layout({ children }) {
  const { auth, logout, isAdmin, isStaff, activeGroup, switchGroup, groups } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = () => { logout(); navigate('/login') }

  const groupType = activeGroup?.group_type || 'chama'
  const showMgr     = ['chama','hybrid'].includes(groupType)
  const showWelfare = ['welfare','hybrid'].includes(groupType)
  const showLoans   = ['chama','hybrid','selfhelp'].includes(groupType)
  const showProj    = ['selfhelp','hybrid'].includes(groupType)

  const userName = auth?.user?.name || 'User'
  const userRole = activeGroup?.role || auth?.user?.role || 'member'

  const typeLabel = {
    chama:'Chama', welfare:'Welfare', hybrid:'Hybrid', selfhelp:'Self Help', investment:'Investment',
  }[groupType] || groupType

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div style={{ padding:'22px 16px 12px', borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
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

      {/* Group switcher */}
      <GroupSwitcher groups={groups} activeGroup={activeGroup} switchGroup={switchGroup} />

      {/* Nav */}
      <nav style={{ flex:1, padding:'4px 8px', overflowY:'auto' }}>
        {isStaff ? (
          <>
            <Divider label="Overview" />
            <NavItem to="/"            icon="📊" label="Dashboard"       end   tourId="nav-dashboard" />

            <Divider label="Management" />
            <NavItem to="/members"     icon="👥" label="Members"               tourId="nav-members" />
            {showLoans   && <NavItem to="/loans"       icon="💰" label="Loans"           tourId="nav-loans" />}
            {showMgr     && <NavItem to="/mgr"         icon="🔄" label="Merry-Go-Round"  tourId="nav-mgr" />}
            <NavItem to="/fines"       icon="⚠️" label="Fines"                tourId="nav-fines" />
            {showWelfare && <NavItem to="/welfare"     icon="🏥" label="Welfare"         tourId="nav-welfare" />}
            {showProj    && <NavItem to="/projects"    icon="🏗️" label="Projects"        tourId="nav-projects" />}
            <NavItem to="/meetings"    icon="📅" label="Meetings"              tourId="nav-meetings" />

            <Divider label="Admin" />
            <NavItem to="/rules"       icon="📋" label="Rules"                 tourId="nav-rules" />
            <NavItem to="/settings"    icon="⚙️" label="Settings"              tourId="nav-settings" />
            {isAdmin && <NavItem to="/pending-members" icon="🔔" label="Join Requests" tourId="nav-pending" />}
            {isAdmin && <NavItem to="/users"           icon="🔑" label="Users"         tourId="nav-users" />}
          </>
        ) : (
          <>
            <Divider label="My Account" />
            <NavItem to="/"            icon="👤" label="My Profile"  end    tourId="nav-profile" />
            {showLoans   && <NavItem to="/my-loan"    icon="💰" label="My Loan"         tourId="nav-my-loan" />}
            {showMgr     && <NavItem to="/mgr"        icon="🔄" label="Merry-Go-Round"  tourId="nav-mgr" />}
            {showWelfare && <NavItem to="/welfare"    icon="🏥" label="Welfare"         tourId="nav-welfare" />}
            {showProj    && <NavItem to="/projects"   icon="🏗️" label="Projects"        tourId="nav-projects" />}
            <NavItem to="/rules"       icon="📋" label="Rules"                 tourId="nav-rules" />
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
    </>
  )

  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>

      {/* ── Desktop sidebar ── */}
      <aside data-tour="sidebar" className="sidebar-desktop" style={{
        width:'var(--sidebar-w)', position:'fixed', top:0, bottom:0, left:0, zIndex:100,
        background:'linear-gradient(180deg, #1e4d2b 0%, #2d5a3d 100%)',
        display:'flex', flexDirection:'column',
        boxShadow:'2px 0 16px rgba(0,0,0,.14)',
      }}>
        <SidebarContent />
      </aside>

      {/* ── Mobile top bar ── */}
      <div className="mobile-topbar" style={{
        position:'fixed', top:0, left:0, right:0, zIndex:200,
        height:'var(--topbar-h)',
        background:'linear-gradient(90deg,#1e4d2b,#2d5a3d)',
        padding:'0 14px', alignItems:'center', gap:12,
        boxShadow:'0 2px 12px rgba(0,0,0,.18)',
      }}>
        <button
          onClick={() => setMobileOpen(o => !o)}
          aria-label="Open menu"
          style={{
            background:'rgba(255,255,255,.12)', border:'none', borderRadius:8,
            width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center',
            color:'#fff', fontSize:18, cursor:'pointer', flexShrink:0,
          }}
        >☰</button>
        <span style={{ flex:1, fontWeight:800, fontSize:15, color:'#fff', letterSpacing:'-.2px' }}>🤝 Chama</span>
        <Avatar name={userName} size={32} />
      </div>

      {/* ── Mobile drawer overlay ── */}
      {mobileOpen && (
        <div
          style={{ position:'fixed', inset:0, zIndex:300, display:'flex' }}
          onClick={e => { if (e.target === e.currentTarget) setMobileOpen(false) }}
        >
          {/* Slide-in drawer */}
          <div style={{
            width:'min(260px, 80vw)',
            background:'linear-gradient(180deg,#1e4d2b 0%,#2d5a3d 100%)',
            display:'flex', flexDirection:'column', height:'100%',
            overflowY:'auto', boxShadow:'4px 0 24px rgba(0,0,0,.25)',
            animation:'drawerIn .22s cubic-bezier(.16,1,.3,1) both',
          }}>
            {/* Drawer close row */}
            <div style={{ display:'flex', justifyContent:'flex-end', padding:'12px 12px 0' }}>
              <button onClick={() => setMobileOpen(false)} style={{
                background:'rgba(255,255,255,.1)', border:'none', borderRadius:7,
                color:'rgba(255,255,255,.7)', fontSize:16, width:30, height:30,
                display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer',
              }}>✕</button>
            </div>
            <SidebarContent />
          </div>
          <div style={{ flex:1, background:'rgba(0,0,0,.45)', backdropFilter:'blur(2px)' }}
            onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* ── Main content ── */}
      <main className="main-content" style={{ minWidth:0 }}>
        {children}
      </main>

      <TourHelpButton />
      <InstallBanner />
    </div>
  )
}
