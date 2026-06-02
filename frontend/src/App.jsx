import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginPage  from './pages/LoginPage'
import Layout     from './components/Layout'
import Dashboard  from './pages/Dashboard'
import Members    from './pages/Members'
import Loans      from './pages/Loans'
import MGR        from './pages/MGR'
import Fines      from './pages/Fines'
import Rules      from './pages/Rules'
import MyProfile  from './pages/MyProfile'
import MyLoan     from './pages/MyLoan'

function Guard() {
  const { auth, loading } = useAuth()
  if (loading) return null
  if (!auth)   return <Navigate to="/login" replace />
  const isTreasurer = auth.role === 'treasurer'
  return (
    <Layout>
      <Routes>
        {isTreasurer ? (
          <>
            <Route path="/"        element={<Dashboard />} />
            <Route path="/members" element={<Members />} />
            <Route path="/loans"   element={<Loans />} />
            <Route path="/mgr"     element={<MGR />} />
            <Route path="/fines"   element={<Fines />} />
            <Route path="/rules"   element={<Rules />} />
          </>
        ) : (
          <>
            <Route path="/"        element={<MyProfile />} />
            <Route path="/my-loan" element={<MyLoan />} />
            <Route path="/mgr"     element={<MGR />} />
            <Route path="/rules"   element={<Rules />} />
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
