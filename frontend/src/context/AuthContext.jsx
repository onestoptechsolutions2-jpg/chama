import { createContext, useContext, useState, useEffect } from 'react'

const Ctx = createContext(null)

export function AuthProvider({ children }) {
  const [auth,    setAuth]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const s = localStorage.getItem('chama_auth')
    if (s) { try { setAuth(JSON.parse(s)) } catch {} }
    setLoading(false)
  }, [])

  const login = (data) => {
    localStorage.setItem('chama_token', data.token)
    localStorage.setItem('chama_auth',  JSON.stringify(data))
    setAuth(data)
  }

  const logout = () => {
    localStorage.removeItem('chama_token')
    localStorage.removeItem('chama_auth')
    setAuth(null)
  }

  return <Ctx.Provider value={{ auth, login, logout, loading }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
