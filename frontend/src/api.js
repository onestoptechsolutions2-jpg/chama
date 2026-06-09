import axios from 'axios'

// VITE_API_URL — set in .env or .env.development
// Dev: '' (Vite proxy rewrites /api → http://localhost:4000)
// Prod: full URL of your Express backend
const BASE = import.meta.env.VITE_API_URL || ''

const api = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token   = localStorage.getItem('chama_token')
  const groupId = localStorage.getItem('chama_group_id')
  if (token)   config.headers.Authorization = `Bearer ${token}`
  if (groupId) config.headers['X-Group-Id'] = groupId
  return config
})

const get = (path, params = {}) => api.get(path,   { params }).then(r => r.data)
const post = (path, body)       => api.post(path,   body).then(r => r.data)
const put  = (path, body)       => api.put(path,    body).then(r => r.data)
const del  = (path)             => api.delete(path).then(r => r.data)

// ── Auth ──────────────────────────────────────────────────────
export const login           = (creds)           => post('/api/auth/login', creds)
export const register        = (data)            => post('/api/auth/register', data)
export const getMe           = ()                => get('/api/auth/me')
export const changePassword  = (body)            => post('/api/auth/change-password', body)

// ── Public Groups ─────────────────────────────────────────────
export const getPublicGroups = ()                => get('/api/groups')
export const getPublicGroup  = (id)              => get(`/api/groups/${id}`)
export const requestJoin     = (id, data)        => post(`/api/groups/${id}/join`, data)
export const getPendingMembers = (id)            => get(`/api/groups/${id}/pending`)
export const reviewMembership = (gid, mid, data) => put(`/api/groups/${gid}/members/${mid}`, data)

// ── Settings ──────────────────────────────────────────────────
export const getSettings     = ()                => get('/api/settings')
export const updateSettings  = (data)            => put('/api/settings', data)

// ── MGR Cycles ────────────────────────────────────────────────
export const getMgrCycles    = ()                => get('/api/mgr/cycles')
export const createMgrCycle  = (data)            => post('/api/mgr/cycles', data)
export const closeMgrCycle   = (id)              => put(`/api/mgr/cycles/${id}/close`, {})
export const getMgrAgreement = ()                => get('/api/mgr/agreement')
export const signMgrAgreement = (data)           => post('/api/mgr/agreement', data)

// ── Payments ──────────────────────────────────────────────────
export const chargePlatformFee = (data)          => post('/api/payments/platform-fee', data)
export const getPayments       = ()              => get('/api/payments')

// ── Group ─────────────────────────────────────────────────────
export const getGroup        = ()                => get('/api/group')
export const updateGroup     = (data)            => put('/api/group', data)

// ── Users ─────────────────────────────────────────────────────
export const getUsers        = ()                => get('/api/users')
export const createUser      = (data)            => post('/api/users', data)
export const updateUser      = (id, data)        => put(`/api/users/${id}`, data)
export const resetPassword   = (id, body)        => post(`/api/users/${id}/reset-password`, body)

// ── Members ───────────────────────────────────────────────────
export const getMembers      = ()                => get('/api/members')
export const getMember       = (id)              => get(`/api/members/${id}`)
export const createMember    = (data)            => post('/api/members', data)
export const updateMember    = (id, data)        => put(`/api/members/${id}`, data)
export const deleteMember    = (id)              => del(`/api/members/${id}`)

// ── Contributions ─────────────────────────────────────────────
export const getContributions    = (params)      => get('/api/contributions', params)
export const createContribution  = (data)        => post('/api/contributions', data)
export const updateContribution  = (id, data)    => put(`/api/contributions/${id}`, data)
export const getContribSummary   = ()            => get('/api/contributions/summary')

// ── Loans ─────────────────────────────────────────────────────
export const getLoans        = (params)          => get('/api/loans', params)
export const createLoan      = (data)            => post('/api/loans', data)
export const updateLoan      = (id, data)        => put(`/api/loans/${id}`, data)
export const repayLoan       = (id, data)        => post(`/api/loans/${id}/repay`, data)
export const getLoanRepayments = (id)            => get(`/api/loans/${id}/repayments`)

// ── MGR ───────────────────────────────────────────────────────
export const getMgrSchedule  = ()                => get('/api/mgr')
export const createMgr       = (data)            => post('/api/mgr', data)
export const updateMgr       = (id, data)        => put(`/api/mgr/${id}`, data)
export const deleteMgr       = (id)              => del(`/api/mgr/${id}`)

// ── Fines ─────────────────────────────────────────────────────
export const getFines        = (params)          => get('/api/fines', params)
export const createFine      = (data)            => post('/api/fines', data)
export const updateFine      = (id, data)        => put(`/api/fines/${id}`, data)

// ── Meetings ──────────────────────────────────────────────────
export const getMeetings     = ()                => get('/api/meetings')
export const createMeeting   = (data)            => post('/api/meetings', data)
export const updateMeeting   = (id, data)        => put(`/api/meetings/${id}`, data)
export const getAttendance   = (meetingId)       => get(`/api/meetings/${meetingId}/attendance`)
export const saveAttendance  = (meetingId, data) => post(`/api/meetings/${meetingId}/attendance`, data)

// ── Welfare ───────────────────────────────────────────────────
export const getWelfareClaims   = (params)       => get('/api/welfare', params)
export const createWelfareClaim = (data)         => post('/api/welfare', data)
export const updateWelfareClaim = (id, data)     => put(`/api/welfare/${id}`, data)
export const getWelfareFund     = ()             => get('/api/welfare/fund')

// ── Projects ──────────────────────────────────────────────────
export const getProjects        = ()             => get('/api/projects')
export const createProject      = (data)         => post('/api/projects', data)
export const updateProject      = (id, data)     => put(`/api/projects/${id}`, data)
export const getProjectContribs = (id)           => get(`/api/projects/${id}/contributions`)
export const addProjectContrib  = (id, data)     => post(`/api/projects/${id}/contributions`, data)

// ── Rules ─────────────────────────────────────────────────────
export const getRules        = (params)          => get('/api/rules', params)
export const createRule      = (data)            => post('/api/rules', data)
export const updateRule      = (id, data)        => put(`/api/rules/${id}`, data)
export const deleteRule      = (id)              => del(`/api/rules/${id}`)

// ── Dashboard ─────────────────────────────────────────────────
export const getDashboard    = ()                => get('/api/dashboard')

export default api
