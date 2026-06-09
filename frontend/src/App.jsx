import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { useGroup }  from './hooks/useChama'
import LoginPage     from './pages/LoginPage'
import Layout        from './components/Layout'
import Dashboard     from './pages/Dashboard'
import Members       from './pages/Members'
import Loans         from './pages/Loans'
import MGR           from './pages/MGR'
import Fines         from './pages/Fines'
import Rules         from './pages/Rules'
import MyProfile     from './pages/MyProfile'
import MyLoan        from './pages/MyLoan'
import Welfare       from './pages/Welfare'
import Projects      from './pages/Projects'
import Users         from './pages/Users'
import Meetings      from './pages/Meetings'

function Guard() {
  const { auth, loading, isStaff, isAdmin } = useAuth()
  const { data: group } = useGroup()

  if (loading) return null
  if (!auth)   return <Navigate to="/login" replace />

  const type       = group?.type || 'chama'
  const showMgr    = ['chama','hybrid'].includes(type)
  const showWelfare= ['welfare','hybrid'].includes(type)
  const showLoans  = ['chama','hybrid','selfhelp'].includes(type)
  const showProj   = ['selfhelp','hybrid'].includes(type)

  return (
    <Layout groupType={type}>
      <Routes>
        {isStaff ? (
          <>
            <Route path="/"          element={<Dashboard />} />
            <Route path="/members"   element={<Members />} />
            {showLoans && <Route path="/loans"   element={<Loans />} />}
            {showMgr   && <Route path="/mgr"     element={<MGR />} />}
            <Route path="/fines"     element={<Fines />} />
            {showWelfare && <Route path="/welfare" element={<Welfare />} />}
            {showProj  && <Route path="/projects" element={<Projects />} />}
            <Route path="/rules"     element={<Rules />} />
            <Route path="/meetings"  element={<Meetings />} />
            {isAdmin && <Route path="/users" element={<Users />} />}
          </>
        ) : (
          <>
            <Route path="/"          element={<MyProfile />} />
            {showLoans   && <Route path="/my-loan"  element={<MyLoan />} />}
            {showMgr     && <Route path="/mgr"      element={<MGR />} />}
            {showWelfare && <Route path="/welfare"  element={<Welfare />} />}
            {showProj    && <Route path="/projects" element={<Projects />} />}
            <Route path="/rules"     element={<Rules />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/*"     element={<Guard />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
