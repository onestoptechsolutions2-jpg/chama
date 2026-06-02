import axios from 'axios'

// VITE_STRAPI_URL is baked in at build time by Vite from .env.production
// Production (Vercel):  https://chama.laitor.co.ke  (direct call to Strapi)
// Development (local):  ''  (Vite proxy rewrites /api-backend → Strapi)
const BASE = import.meta.env.VITE_STRAPI_URL || ''

const api = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' },
})

// Attach API token from localStorage on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('chama_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

const get  = (path, params = {}) => api.get(path,  { params }).then(r => r.data)
const post = (path, body)        => api.post(path,  { data: body }).then(r => r.data)
const put  = (path, body)        => api.put(path,   { data: body }).then(r => r.data)

// ── Members ───────────────────────────────────────────────────────────────────
export const getMembers   = () => get('/api/members', { 'pagination[pageSize]': 100, sort: 'name:asc' })
export const createMember = (data) => post('/api/members', data)
export const updateMember = (docId, data) => put(`/api/members/${docId}`, data)

// ── Loans ─────────────────────────────────────────────────────────────────────
// Field is "loanstatus" in your Strapi schema (not "status")
export const getLoans   = () => get('/api/loans', { populate: 'member', 'pagination[pageSize]': 100 })
export const createLoan = (data) => post('/api/loans', data)
export const updateLoan = (docId, data) => put(`/api/loans/${docId}`, data)

// ── Contributions ─────────────────────────────────────────────────────────────
export const getContributions   = () => get('/api/contributions', { populate: 'member', 'pagination[pageSize]': 200 })
export const createContribution = (data) => post('/api/contributions', data)
export const updateContribution = (docId, data) => put(`/api/contributions/${docId}`, data)

// ── MGR Schedule ──────────────────────────────────────────────────────────────
// Your schema uses "member" and "member2" (not recipientOne/Two)
export const getMgrSchedule = () => get('/api/mgr-schedules', {
  'populate[member][fields]':  'name',
  'populate[member2][fields]': 'name',
  sort: 'monthIndex:asc',
  'pagination[pageSize]': 20,
})
export const updateMgr = (docId, data) => put(`/api/mgr-schedules/${docId}`, data)
export const createMgr = (data) => post('/api/mgr-schedules', data)

// ── Fines ─────────────────────────────────────────────────────────────────────
export const getFines   = () => get('/api/fines', { populate: 'member', 'pagination[pageSize]': 200, sort: 'createdAt:desc' })
export const createFine = (data) => post('/api/fines', data)
export const updateFine = (docId, data) => put(`/api/fines/${docId}`, data)

// ── Meetings ──────────────────────────────────────────────────────────────────
export const getMeetings   = () => get('/api/meetings', { sort: 'meetingDate:desc', 'pagination[pageSize]': 20 })
export const createMeeting = (data) => post('/api/meetings', data)

export default api
