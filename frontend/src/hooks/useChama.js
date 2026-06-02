import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '../api'

export const useMembers  = () => useQuery({ queryKey:['members'],  queryFn: api.getMembers,       select: d => d.data || [] })
export const useLoans    = () => useQuery({ queryKey:['loans'],    queryFn: api.getLoans,         select: d => d.data || [] })
export const useContribs = () => useQuery({ queryKey:['contribs'],queryFn: api.getContributions, select: d => d.data || [] })
export const useMgr      = () => useQuery({ queryKey:['mgr'],     queryFn: api.getMgrSchedule,   select: d => d.data || [] })
export const useFines    = () => useQuery({ queryKey:['fines'],   queryFn: api.getFines,         select: d => d.data || [] })
export const useMeetings = () => useQuery({ queryKey:['meetings'],queryFn: api.getMeetings,       select: d => d.data || [] })

function useMut(fn, keys) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => keys.forEach(k => qc.invalidateQueries({ queryKey: [k] })),
  })
}

export const useCreateMember  = () => useMut(api.createMember,  ['members'])
export const useUpdateMember  = () => useMut(({ id, data }) => api.updateMember(id, data), ['members'])
export const useCreateLoan    = () => useMut(api.createLoan,    ['loans'])
export const useUpdateLoan    = () => useMut(({ id, data }) => api.updateLoan(id, data),   ['loans'])
export const useCreateFine    = () => useMut(api.createFine,    ['fines','members'])
export const useUpdateFine    = () => useMut(({ id, data }) => api.updateFine(id, data),   ['fines'])
export const useUpdateMgr     = () => useMut(({ id, data }) => api.updateMgr(id, data),    ['mgr'])
export const useCreateMgr     = () => useMut(api.createMgr,    ['mgr'])
export const useUpdateMember2 = () => useMut(({ id, data }) => api.updateMember(id, data), ['members'])

export const ksh          = n => 'Ksh ' + Number(n||0).toLocaleString()
export const totalSavings = m => (m.capital||0) + (m.security||0) + (m.personalSavings||0)
export const loanLimit    = m => totalSavings(m) * 2
export const initials     = n => (n||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()
export const activeLoans  = ls => ls.filter(l => ['active','extended'].includes(l.loanstatus))
