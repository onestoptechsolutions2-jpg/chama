import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { useGroup }  from './hooks/useChama'
import LoginPage          from './pages/LoginPage'
import RegisterPage       from './pages/RegisterPage'
import LandingPage        from './pages/LandingPage'
import SuperAdminPage     from './pages/SuperAdminPage'
import Layout             from './components/Layout'
import { TourProvider }  from './components/AppTour'
import Dashboard          from './pages/Dashboard'
import Members            from './pages/Members'
import Loans              from './pages/Loans'
import MGR                from './pages/MGR'
import Fines              from './pages/Fines'
import Rules              from './pages/Rules'
import MyProfile          from './pages/MyProfile'
import MyLoan             from './pages/MyLoan'
import Welfare            from './pages/Welfare'
import Projects           from './pages/Projects'
import Users              from './pages/Users'
import Meetings           from './pages/Meetings'
import SettingsPage       from './pages/SettingsPage'
import PendingMembersPage from './pages/PendingMembersPage'

function Guard() {
  const { auth, loading, isStaff, isAdmin, activeGroup } = useAuth()
  const { data: group } = useGroup()

  if (loading) return null
  if (!auth)   return <Navigate to="/landing" replace />

  // Logged in but no group yet → show landing to pick / join a group
  if (!activeGroup) return <Navigate to="/landing" replace />

  const type       = activeGroup?.group_type || group?.type || 'chama'
  const showMgr    = ['chama','hybrid'].includes(type)
  const showWelfare= ['welfare','hybrid'].includes(type)
  const showLoans  = ['chama','hybrid','selfhelp'].includes(type)
  const showProj   = ['selfhelp','hybrid'].includes(type)

  return (
    <TourProvider>
    <Layout>
      <Routes>
        {isStaff ? (
          <>
            <Route path="/"                  element={<Dashboard />} />
            <Route path="/members"           element={<Members />} />
            {showLoans && <Route path="/loans"     element={<Loans />} />}
            {showMgr   && <Route path="/mgr"       element={<MGR />} />}
            <Route path="/fines"             element={<Fines />} />
            {showWelfare && <Route path="/welfare" element={<Welfare />} />}
            {showProj    && <Route path="/projects"element={<Projects />} />}
            <Route path="/rules"             element={<Rules />} />
            <Route path="/meetings"          element={<Meetings />} />
            <Route path="/settings"          element={<SettingsPage />} />
            {isAdmin && <Route path="/pending-members" element={<PendingMembersPage />} />}
            {isAdmin && <Route path="/users" element={<Users />} />}
          </>
        ) : (
          <>
            <Route path="/"                  element={<MyProfile />} />
            {showLoans   && <Route path="/my-loan"   element={<MyLoan />} />}
            {showMgr     && <Route path="/mgr"       element={<MGR />} />}
            {showWelfare && <Route path="/welfare"   element={<Welfare />} />}
            {showProj    && <Route path="/projects"  element={<Projects />} />}
            <Route path="/rules"             element={<Rules />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
    </TourProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/landing"     element={<LandingPage />} />
          <Route path="/login"       element={<LoginPage />} />
          <Route path="/register"    element={<RegisterPage />} />
          <Route path="/super-admin" element={<SuperAdminPage />} />
          <Route path="/*"           element={<Guard />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
