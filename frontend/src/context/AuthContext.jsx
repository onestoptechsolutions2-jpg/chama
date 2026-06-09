import { createContext, useContext, useState, useEffect } from 'react'
import * as apiModule from '../api'

const Ctx = createContext(null)

export function AuthProvider({ children }) {
  const [auth,        setAuth]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [activeGroup, setActiveGroup] = useState(null) // { group_id, role, group_name, group_type, member_id }

  useEffect(() => {
    const s  = localStorage.getItem('chama_auth')
    const gid = localStorage.getItem('chama_group_id')
    if (s) {
      try {
        const parsed = JSON.parse(s)
        setAuth(parsed)
        // Restore active group
        const groups = parsed.groups || []
        const match  = gid ? groups.find(g => String(g.group_id) === gid) : groups[0]
        if (match) {
          setActiveGroup(match)
          localStorage.setItem('chama_group_id', String(match.group_id))
        }
      } catch {}
    }
    setLoading(false)
  }, [])

  const login = async ({ email, phone, password }) => {
    const data = await apiModule.login({ email, phone, password })
    localStorage.setItem('chama_token', data.token)
    localStorage.setItem('chama_auth',  JSON.stringify(data))
    const firstGroup = (data.groups || [])[0] || null
    if (firstGroup) {
      localStorage.setItem('chama_group_id', String(firstGroup.group_id))
      setActiveGroup(firstGroup)
    }
    setAuth(data)
    return data
  }

  const register = async ({ name, phone, email, password }) => {
    const data = await apiModule.register({ name, phone, email, password })
    localStorage.setItem('chama_token', data.token)
    localStorage.setItem('chama_auth',  JSON.stringify(data))
    setAuth(data)
    return data
  }

  const switchGroup = (groupId) => {
    const groups = auth?.groups || []
    const match  = groups.find(g => g.group_id === groupId)
    if (match) {
      localStorage.setItem('chama_group_id', String(groupId))
      setActiveGroup(match)
    }
  }

  const logout = () => {
    localStorage.removeItem('chama_token')
    localStorage.removeItem('chama_auth')
    localStorage.removeItem('chama_group_id')
    setAuth(null)
    setActiveGroup(null)
  }

  // Role from active group membership (fallback to user.role)
  const role        = activeGroup?.role || auth?.user?.role || 'member'
  const isAdmin     = role === 'admin'
  const isTreasurer = role === 'treasurer'
  const isSecretary = role === 'secretary'
  const isStaff     = isAdmin || isTreasurer || isSecretary
  const groups      = auth?.groups || []

  return (
    <Ctx.Provider value={{
      auth, login, register, logout, loading,
      role, isAdmin, isTreasurer, isSecretary, isStaff,
      activeGroup, switchGroup, groups,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
