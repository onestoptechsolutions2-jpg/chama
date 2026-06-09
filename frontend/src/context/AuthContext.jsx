import { createContext, useContext, useState, useEffect } from 'react'
import * as apiModule from '../api'

const Ctx = createContext(null)

export function AuthProvider({ children }) {
  const [auth,    setAuth]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const s = localStorage.getItem('chama_auth')
    if (s) { try { setAuth(JSON.parse(s)) } catch {} }
    setLoading(false)
  }, [])

  // login({ email/phone, password }) → calls API, stores result
  const login = async ({ email, phone, password }) => {
    const data = await apiModule.login({ email, phone, password })
    localStorage.setItem('chama_token', data.token)
    localStorage.setItem('chama_auth',  JSON.stringify(data))
    setAuth(data)
    return data
  }

  const logout = () => {
    localStorage.removeItem('chama_token')
    localStorage.removeItem('chama_auth')
    setAuth(null)
  }

  // Helpers derived from the JWT payload
  const isAdmin      = auth?.user?.role === 'admin'
  const isTreasurer  = auth?.user?.role === 'treasurer'
  const isSecretary  = auth?.user?.role === 'secretary'
  const isStaff      = isAdmin || isTreasurer || isSecretary
  const role         = auth?.user?.role || 'member'

  return (
    <Ctx.Provider value={{ auth, login, logout, loading, role, isAdmin, isTreasurer, isSecretary, isStaff }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
