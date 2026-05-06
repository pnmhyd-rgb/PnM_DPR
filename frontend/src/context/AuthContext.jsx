import { createContext, useContext, useState } from 'react'
import { login as apiLogin, updateMe as apiUpdateMe } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')) } catch { return null }
  })

  const login = async (username, password) => {
    const res = await apiLogin({ username, password })
    const { token, user: u } = res.data
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(u))
    setUser(u)
    return u
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
  }

  const updateProfile = async (data) => {
    const res = await apiUpdateMe(data)
    const updated = { ...user, ...res.data.data }
    localStorage.setItem('user', JSON.stringify(updated))
    setUser(updated)
    return updated
  }

  return (
    <AuthContext.Provider value={{
      user,
      isAdmin: user?.role === 'admin',
      login,
      logout,
      updateProfile
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
