import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSettings, updateSettings, getMgrConfig, updateMgrConfig } from '../api'
import { PageHeader, Card, CardTitle, Input, Sel, Btn, Toast } from '../components/UI'
import { useAuth } from '../context/AuthContext'

export default function SettingsPage() {
  const { isAdmin } = useAuth()
  const qc = useQueryClient()
  const { data: settings, isLoading } = useQuery({ queryKey:['settings'], queryFn: getSettings })
  const { data: mgrConfig } = useQuery({ queryKey:['mgrConfig'], queryFn: getMgrConfig })
  const mut    = useMutation({ mutationFn: updateSettings,  onSuccess: () => qc.invalidateQueries({ queryKey:['settings'] }) })
  const mgrMut = useMutation({ mutationFn: updateMgrConfig, onSuccess: () => qc.invalidateQueries({ queryKey:['mgrConfig'] }) })

  const [tab, setTab]     = useState('group')
  const [form, setForm]   = useState({})
  const [mgrForm, setMgrForm] = useState({})
  const [toast, setToast] = useState(null)

  useEffect(() => { if (settings)  setForm(settings)   }, [settings])
  useEffect(() => { if (mgrConfig) setMgrForm(mgrConfig) }, [mgrConfig])

  const set    = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setMgr = (k, v) => setMgrForm(f => ({ ...f, [k]: v }))
  const notify = (msg, type='ok') => { setToast({msg,type}); setTimeout(()=>setToast(null),3000) }

  const save = async (fields) => {
    const patch = {}
    fields.forEach(f => { patch[f] = form[f] })
    try { await mut.mutateAsync(patch); notify('Saved!') }
    catch (e) { notify(e.response?.data?.error || 'Save failed','err') }
  }

  const saveMgr = async () => {
    try { await mgrMut.mutateAsync(mgrForm); notify('MGR cycle saved!') }
    catch (e) { notify(e.response?.data?.error || 'Save failed','err') }
  }

  const tabs = [
    { id:'group',         label:'Group' },
    { id:'contributions', label:'Contributions' },
    { id:'loans',         label:'Loans' },
    { id:'mgr',           label:'MGR Cycle' },
    { id:'fines',         label:'Fines' },
  ]

  if (isLoading) return <div style={{ padding:40, textAlign:'center', color:'var(--muted)' }}>Loading…</div>

  return (
    <div>
      <PageHeader title="Settings" sub="Configure your group" />

      {/* Tab bar */}
      <div style={{ display:'flex', gap:4, marginBottom:24, background:'var(--card)', border:'1px solid var(--border)', borderRadius:10, padding:4, width:'fit-content' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding:'7px 16px', borderRadius:7, border:'none', cursor:'pointer', fontWeight:600, fontSize:13,
            background: tab === t.id ? 'var(--accent)' : 'transparent',
            color: tab === t.id ? '#fff' : 'var(--muted)',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'group' && (
        <Card>
          <CardTitle>Group details</CardTitle>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            <Input label="Group name" value={form.name||''} onChange={e=>set('name',e.target.value)} disabled={!isAdmin} />
            <Sel label="Type" value={form.type||''} onChange={e=>set('type',e.target.value)} disabled={!isAdmin}>
              <option value="chama">Chama</option>
              <option value="welfare">Welfare</option>
              <option value="hybrid">Hybrid</option>
              <option value="investment">Investment</option>
            </Sel>
          </div>
          <Input label="Description" value={form.description||''} onChange={e=>set('description',e.target.value)} disabled={!isAdmin} />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16 }}>
            <div>
              <label style={lbl}>Public group</label>
              <select value={String(form.is_public)} onChange={e=>set('is_public',e.target.value==='true')} style={sel} disabled={!isAdmin}>
                <option value="true">Yes — visible to all</option>
                <option value="false">No — invite only</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Require admin approval</label>
              <select value={String(form.require_approval)} onChange={e=>set('require_approval',e.target.value==='true')} style={sel} disabled={!isAdmin}>
                <option value="true">Yes</option>
                <option value="false">No (auto-join)</option>
              </select>
            </div>
            <Input label="Max members" type="number" value={form.max_members||''} onChange={e=>set('max_members',e.target.value)} disabled={!isAdmin} />
          </div>
          {isAdmin && <Btn variant="primary" onClick={()=>save(['name','type','description','is_public','require_approval','max_members'])} disabled={mut.isPending}>Save group details</Btn>}
        </Card>
      )}

      {tab === 'contributions' && (
        <Card>
          <CardTitle>Share capital & contributions</CardTitle>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            <Input label="Share price (Ksh)" type="number" value={form.share_price||''} onChange={e=>set('share_price',e.target.value)} disabled={!isAdmin} />
            <Input label="Shares per member" type="number" value={form.shares_per_member||''} onChange={e=>set('shares_per_member',e.target.value)} disabled={!isAdmin} />
            <div>
              <label style={lbl}>Contribution day</label>
              <select value={form.contribution_day||''} onChange={e=>set('contribution_day',e.target.value)} style={sel} disabled={!isAdmin}>
                <option value="">— select —</option>
                {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d=>(
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>
          {isAdmin && <Btn variant="primary" onClick={()=>save(['share_price','shares_per_member','contribution_day'])} disabled={mut.isPending}>Save</Btn>}
        </Card>
      )}

      {tab === 'loans' && (
        <Card>
          <CardTitle>Loan policy</CardTitle>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            <Input label="Interest rate (%)" type="number" step="0.1" value={form.loan_interest_rate||''} onChange={e=>set('loan_interest_rate',e.target.value)} disabled={!isAdmin} />
            <Input label="Max multiplier (×savings)" type="number" step="0.1" value={form.loan_max_multiplier||''} onChange={e=>set('loan_max_multiplier',e.target.value)} disabled={!isAdmin} />
            <Input label="Repayment months" type="number" value={form.loan_repayment_months||''} onChange={e=>set('loan_repayment_months',e.target.value)} disabled={!isAdmin} />
            <Input label="Late penalty (Ksh/mo)" type="number" value={form.loan_late_penalty||''} onChange={e=>set('loan_late_penalty',e.target.value)} disabled={!isAdmin} />
          </div>
          {isAdmin && <Btn variant="primary" onClick={()=>save(['loan_interest_rate','loan_max_multiplier','loan_repayment_months','loan_late_penalty'])} disabled={mut.isPending}>Save</Btn>}
        </Card>
      )}

      {tab === 'mgr' && (
        <>
          <Card>
            <CardTitle>Cycle frequency</CardTitle>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(min(100%,200px),1fr))', gap:16 }}>
              <div>
                <label style={lbl}>Frequency</label>
                <select value={mgrForm.mgr_frequency||'monthly'} onChange={e=>setMgr('mgr_frequency',e.target.value)} style={sel} disabled={!isAdmin}>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Every 2 weeks</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div>
                <label style={lbl}>
                  {(mgrForm.mgr_frequency||'monthly') === 'monthly'
                    ? 'Day of month (1–28)'
                    : 'Day of week'}
                </label>
                {(mgrForm.mgr_frequency||'monthly') === 'monthly' ? (
                  <input type="number" min={1} max={28} value={mgrForm.mgr_cycle_day||1}
                    onChange={e=>setMgr('mgr_cycle_day',parseInt(e.target.value))}
                    style={{...sel}} disabled={!isAdmin} />
                ) : (
                  <select value={mgrForm.mgr_cycle_day||0} onChange={e=>setMgr('mgr_cycle_day',parseInt(e.target.value))} style={sel} disabled={!isAdmin}>
                    {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d,i)=>(
                      <option key={d} value={i}>{d}</option>
                    ))}
                  </select>
                )}
              </div>
              <Input label="Recipients per cycle" type="number" min={1} max={10}
                value={mgrForm.mgr_recipients_per_cycle||1}
                onChange={e=>setMgr('mgr_recipients_per_cycle',parseInt(e.target.value))}
                disabled={!isAdmin} />
              <Input label="Start date" type="date"
                value={mgrForm.mgr_start_date ? mgrForm.mgr_start_date.split('T')[0] : ''}
                onChange={e=>setMgr('mgr_start_date',e.target.value)}
                disabled={!isAdmin} />
              <Input label="Contribution per cycle (Ksh)" type="number"
                value={mgrForm.mgr_contribution_amount||mgrForm.share_price||''}
                onChange={e=>setMgr('mgr_contribution_amount',e.target.value)}
                disabled={!isAdmin} />
            </div>
            {/* Live preview */}
            <div style={{
              marginTop:16, padding:'12px 16px', background:'var(--surface2)',
              borderRadius:10, border:'1px solid var(--border)',
              display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:12,
            }}>
              {[
                { label:'Frequency', value: { weekly:'Weekly', biweekly:'Every 2 wks', monthly:'Monthly' }[mgrForm.mgr_frequency||'monthly'] },
                { label:'Recipients/cycle', value: mgrForm.mgr_recipients_per_cycle || 1 },
                { label:'Contribution/cycle', value: `Ksh ${Number(mgrForm.mgr_contribution_amount||0).toLocaleString()}` },
                { label:'Platform fee', value: `${form.mgr_fee_pct||5}%` },
              ].map(({label,value}) => (
                <div key={label}>
                  <div style={{ fontSize:11, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'.5px' }}>{label}</div>
                  <div style={{ fontSize:15, fontWeight:700, color:'var(--accent)', marginTop:3 }}>{value}</div>
                </div>
              ))}
            </div>
            {isAdmin && (
              <div style={{ marginTop:16 }}>
                <Btn variant="primary" onClick={saveMgr} disabled={mgrMut.isPending}>Save cycle config</Btn>
                <span style={{ marginLeft:10, fontSize:12, color:'var(--muted)' }}>
                  After saving, go to MGR → Generate Schedule to rebuild the timeline.
                </span>
              </div>
            )}
          </Card>
          <Card>
            <CardTitle>MGR terms & platform fee</CardTitle>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              <Input label="Platform fee (%)" type="number" step="0.1" value={form.mgr_fee_pct||5} onChange={e=>set('mgr_fee_pct',e.target.value)} disabled={!isAdmin} />
            </div>
            <div>
              <label style={lbl}>MGR terms & conditions</label>
              <textarea value={form.mgr_terms||''} onChange={e=>set('mgr_terms',e.target.value)} rows={5}
                disabled={!isAdmin}
                style={{ width:'100%', boxSizing:'border-box', padding:'10px 12px', borderRadius:8, border:'1.5px solid var(--border)', background:'var(--bg)', color:'var(--text)', fontSize:13, resize:'vertical' }} />
            </div>
            {isAdmin && <Btn variant="primary" onClick={()=>save(['mgr_fee_pct','mgr_terms'])} disabled={mut.isPending}>Save</Btn>}
          </Card>
        </>
      )}

      {tab === 'fines' && (
        <Card>
          <CardTitle>Fines</CardTitle>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16 }}>
            <Input label="Late arrival (Ksh)" type="number" value={form.fine_lateness||''} onChange={e=>set('fine_lateness',e.target.value)} disabled={!isAdmin} />
            <Input label="Absence (Ksh)" type="number" value={form.fine_absence||''} onChange={e=>set('fine_absence',e.target.value)} disabled={!isAdmin} />
            <Input label="Rule violation (Ksh)" type="number" value={form.fine_rule_violation||''} onChange={e=>set('fine_rule_violation',e.target.value)} disabled={!isAdmin} />
          </div>
          {isAdmin && <Btn variant="primary" onClick={()=>save(['fine_lateness','fine_absence','fine_rule_violation'])} disabled={mut.isPending}>Save fines</Btn>}
        </Card>
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}

const lbl = { display:'block', fontSize:13, fontWeight:600, color:'var(--text)', marginBottom:6 }
const sel = { width:'100%', padding:'10px 12px', borderRadius:8, border:'1.5px solid var(--border)', background:'var(--bg)', color:'var(--text)', fontSize:14 }
