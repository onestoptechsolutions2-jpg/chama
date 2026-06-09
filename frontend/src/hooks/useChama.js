import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '../api'

// ── Queries ───────────────────────────────────────────────────
// New backend returns arrays directly (not {data:[...]})
export const useGroup    = () => useQuery({ queryKey:['group'],    queryFn: api.getGroup })
export const useMembers  = () => useQuery({ queryKey:['members'],  queryFn: api.getMembers })
export const useLoans    = () => useQuery({ queryKey:['loans'],    queryFn: () => api.getLoans() })
export const useContribs = () => useQuery({ queryKey:['contribs'], queryFn: () => api.getContributions() })
export const useMgr      = () => useQuery({ queryKey:['mgr'],      queryFn: api.getMgrSchedule })
export const useFines    = () => useQuery({ queryKey:['fines'],    queryFn: () => api.getFines() })
export const useMeetings = () => useQuery({ queryKey:['meetings'], queryFn: api.getMeetings })
export const useRules    = () => useQuery({ queryKey:['rules'],    queryFn: () => api.getRules({ active: true }) })
export const useWelfare  = () => useQuery({ queryKey:['welfare'],  queryFn: () => api.getWelfareClaims() })
export const useProjects = () => useQuery({ queryKey:['projects'], queryFn: api.getProjects })
export const useDashboard = () => useQuery({ queryKey:['dashboard'], queryFn: api.getDashboard })

// ── Mutation helper ───────────────────────────────────────────
function useMut(fn, keys) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => keys.forEach(k => qc.invalidateQueries({ queryKey: [k] })),
  })
}

// ── Member mutations ──────────────────────────────────────────
export const useCreateMember = () => useMut(api.createMember, ['members'])
export const useUpdateMember = () => useMut(({ id, data }) => api.updateMember(id, data), ['members'])

// ── Loan mutations ────────────────────────────────────────────
export const useCreateLoan = () => useMut(api.createLoan, ['loans', 'members', 'dashboard'])
export const useUpdateLoan = () => useMut(({ id, data }) => api.updateLoan(id, data), ['loans', 'dashboard'])
export const useRepayLoan  = () => useMut(({ id, data }) => api.repayLoan(id, data), ['loans', 'dashboard'])

// ── Fine mutations ────────────────────────────────────────────
export const useCreateFine = () => useMut(api.createFine, ['fines', 'members'])
export const useUpdateFine = () => useMut(({ id, data }) => api.updateFine(id, data), ['fines', 'members'])

// ── MGR mutations ─────────────────────────────────────────────
export const useCreateMgr  = () => useMut(api.createMgr, ['mgr'])
export const useUpdateMgr  = () => useMut(({ id, data }) => api.updateMgr(id, data), ['mgr'])

// ── Contribution mutations ────────────────────────────────────
export const useCreateContrib = () => useMut(api.createContribution, ['contribs', 'members', 'dashboard'])

// ── Meeting mutations ─────────────────────────────────────────
export const useCreateMeeting = () => useMut(api.createMeeting, ['meetings'])
export const useUpdateMeeting = () => useMut(({ id, data }) => api.updateMeeting(id, data), ['meetings'])

// ── Welfare mutations ─────────────────────────────────────────
export const useCreateClaim  = () => useMut(api.createWelfareClaim, ['welfare', 'dashboard'])
export const useUpdateClaim  = () => useMut(({ id, data }) => api.updateWelfareClaim(id, data), ['welfare', 'dashboard'])

// ── Project mutations ─────────────────────────────────────────
export const useCreateProject = () => useMut(api.createProject, ['projects'])
export const useUpdateProject = () => useMut(({ id, data }) => api.updateProject(id, data), ['projects'])

// ── Rule mutations ────────────────────────────────────────────
export const useCreateRule = () => useMut(api.createRule, ['rules'])
export const useUpdateRule = () => useMut(({ id, data }) => api.updateRule(id, data), ['rules'])
export const useDeleteRule = () => useMut(api.deleteRule, ['rules'])

// ── Utilities ─────────────────────────────────────────────────
export const ksh          = n  => 'Ksh ' + Number(n || 0).toLocaleString()
export const totalSavings = m  => (Number(m.capital)||0) + (Number(m.security)||0) + (Number(m.personal_savings)||0)
export const loanLimit    = m  => m.limit_reduced ? totalSavings(m) : totalSavings(m) * 2
export const initials     = n  => (n||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()
export const activeLoans  = ls => (ls||[]).filter(l => ['active','extended'].includes(l.status))
