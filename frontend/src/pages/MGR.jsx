import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import {
  PageHeader, Card, CardTitle, Badge, Btn, Input, Loader, EmptyState, Toast, Table, Tr, Td
} from '../components/UI'
import {
  getMgrSchedule, getMgrTurns, setMgrTurns, claimMgrSlot, updateMgrSlot,
  generateMgrSchedule, autoAssignMgr, getMgrAgreement, signMgrAgreement,
  getMgrConfig,
} from '../api'
import MgrAgreementModal from '../components/MgrAgreementModal'

const ksh = n => 'Ksh ' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0 })

// ── Status badge ────────────────────────────────────────────────────────────
function SlotBadge({ status }) {
  const map = {
    open:          { label: 'Open',         variant: 'info'   },
    claimed:       { label: 'Claimed',      variant: 'ok'     },
    auto_assigned: { label: 'Auto-assigned',variant: 'warn'   },
    paid:          { label: 'Paid',         variant: 'purple' },
    skipped:       { label: 'Skipped',      variant: 'grey'   },
  }
  const { label, variant } = map[status] || { label: status, variant: 'grey' }
  return <Badge variant={variant}>{label}</Badge>
}

// ── Frequency label ─────────────────────────────────────────────────────────
const freqLabel = { weekly: 'Weekly', biweekly: 'Every 2 wks', monthly: 'Monthly' }

// ── Cycle summary chip ──────────────────────────────────────────────────────
function CycleRow({ cycle, myMemberId, onClaim, onAdminUpdate, isAdmin, isStaff }) {
  const [open, setOpen] = useState(false)
  const allPaid   = cycle.slots.length > 0 && cycle.slots.every(s => s.status === 'paid')
  const hasMine   = cycle.slots.some(s => s.member_id === myMemberId)
  const hasOpen   = cycle.slots.some(s => s.status === 'open')

  const cycleStatus = allPaid ? 'paid'
    : cycle.slots.some(s => s.status !== 'open') ? 'partial'
    : 'open'

  const statusColor = { paid:'var(--accent)', partial:'#b8860b', open:'var(--muted)' }[cycleStatus]

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 12,
      overflow: 'hidden', marginBottom: 10,
      boxShadow: hasMine ? '0 0 0 2px var(--accent)' : 'none',
    }}>
      {/* Header row */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
          cursor: 'pointer', background: 'var(--card)',
          userSelect: 'none',
        }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          background: 'var(--accent)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 800,
        }}>
          {cycle.cycle_number}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>
            Cycle {cycle.cycle_number}
            {cycle.scheduled_date && (
              <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>
                📅 {new Date(cycle.scheduled_date).toLocaleDateString('en-KE', { day:'numeric', month:'short', year:'numeric' })}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            {cycle.slots.length} slot{cycle.slots.length !== 1 ? 's' : ''} · {ksh(cycle.payout_per_slot)} each
            {hasMine && <span style={{ color: 'var(--accent)', fontWeight: 600, marginLeft: 8 }}>● Your turn</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor }} />
          <span style={{ fontSize: 11, color: statusColor, fontWeight: 600, textTransform: 'uppercase' }}>
            {cycleStatus}
          </span>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded slots */}
      {open && (
        <div style={{ padding: '0 16px 16px', background: 'var(--bg)' }}>
          {cycle.slots.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 13, padding: '12px 0' }}>No slots generated yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              {cycle.slots.map(slot => (
                <div key={slot.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 10,
                  background: 'var(--card)', border: '1px solid var(--border)',
                }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)', minWidth: 40 }}>
                    Slot {slot.slot_number}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {slot.member_name ? (
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{slot.member_name}</span>
                    ) : (
                      <span style={{ color: 'var(--muted)', fontSize: 13, fontStyle: 'italic' }}>Unclaimed</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
                    {ksh(slot.payout_amount)}
                  </div>
                  <SlotBadge status={slot.status} />
                  {slot.status === 'open' && !isStaff && (
                    <Btn size="sm" variant="primary" onClick={() => onClaim(slot.id)}>
                      Claim
                    </Btn>
                  )}
                  {isAdmin && slot.status !== 'paid' && (
                    <Btn size="sm" onClick={() => onAdminUpdate(slot)}>Edit</Btn>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Admin slot edit modal ───────────────────────────────────────────────────
function SlotEditModal({ slot, members, onSave, onClose }) {
  const [memberId, setMemberId] = useState(slot.member_id || '')
  const [status,   setStatus]   = useState(slot.status)

  return (
    <div style={{ position:'fixed', inset:0, zIndex:500, background:'rgba(0,0,0,.4)',
      display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="modal-sheet" style={{
        background:'var(--card)', borderRadius:16, padding:28, width:'min(90vw,400px)',
        boxShadow:'0 24px 60px rgba(0,0,0,.25)',
      }}>
        <h3 style={{ marginBottom:20, fontSize:16 }}>
          Edit Slot — Cycle {slot.cycle_number}, Slot {slot.slot_number}
        </h3>
        <div style={{ marginBottom:14 }}>
          <label style={{ fontSize:12, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:6 }}>
            Assign member
          </label>
          <select value={memberId} onChange={e=>setMemberId(e.target.value)}
            style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1.5px solid var(--border)',
              background:'var(--bg)', color:'var(--text)', fontSize:14 }}>
            <option value="">— Unassigned —</option>
            {members.map(m => (
              <option key={m.id} value={m.id}>{m.name} ({m.member_id})</option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom:20 }}>
          <label style={{ fontSize:12, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:6 }}>
            Status
          </label>
          <select value={status} onChange={e=>setStatus(e.target.value)}
            style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1.5px solid var(--border)',
              background:'var(--bg)', color:'var(--text)', fontSize:14 }}>
            <option value="open">Open</option>
            <option value="claimed">Claimed</option>
            <option value="auto_assigned">Auto-assigned</option>
            <option value="paid">Paid</option>
            <option value="skipped">Skipped</option>
          </select>
        </div>
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={() => onSave({ member_id: memberId || null, status })}>
            Save
          </Btn>
        </div>
      </div>
    </div>
  )
}

// ── Turns management panel ──────────────────────────────────────────────────
function TurnsPanel({ turns, members, isAdmin, onSave }) {
  const [edits, setEdits] = useState({}) // memberId → turns_total

  const getTurns = (memberId) => {
    if (edits[memberId] !== undefined) return edits[memberId]
    const found = turns.find(t => t.member_id === memberId)
    return found?.turns_total ?? 1
  }

  return (
    <Card>
      <CardTitle>Member turns
        <span style={{ fontSize:11, fontWeight:400, color:'var(--muted)', marginLeft:8 }}>
          Extra turns = extra contributions (2 turns → pays 2× per cycle)
        </span>
      </CardTitle>
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {members.map(m => {
          const t = getTurns(m.id)
          const turn = turns.find(x => x.member_id === m.id)
          const taken = parseInt(turn?.slots_taken || 0)
          return (
            <div key={m.id} style={{
              display:'flex', alignItems:'center', gap:12, padding:'10px 14px',
              border:'1px solid var(--border)', borderRadius:10, background:'var(--card)',
            }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:600, fontSize:13 }}>{m.name}</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>
                  {taken}/{t} slots taken · {taken < t ? `${t - taken} remaining` : '✓ complete'}
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                {isAdmin ? (
                  <>
                    <button
                      onClick={() => setEdits(e => ({ ...e, [m.id]: Math.max(1, (e[m.id]??t) - 1) }))}
                      style={{ width:28, height:28, borderRadius:7, border:'1px solid var(--border)',
                        background:'var(--surface)', cursor:'pointer', fontSize:16, fontWeight:700 }}>−
                    </button>
                    <span style={{ width:24, textAlign:'center', fontWeight:700, fontSize:16 }}>{t}</span>
                    <button
                      onClick={() => setEdits(e => ({ ...e, [m.id]: (e[m.id]??t) + 1 }))}
                      style={{ width:28, height:28, borderRadius:7, border:'1px solid var(--border)',
                        background:'var(--surface)', cursor:'pointer', fontSize:16, fontWeight:700 }}>+
                    </button>
                    {edits[m.id] !== undefined && edits[m.id] !== (turn?.turns_total ?? 1) && (
                      <Btn size="sm" variant="primary"
                        onClick={() => { onSave(m.id, edits[m.id]); setEdits(e => { const n={...e}; delete n[m.id]; return n }) }}>
                        Save
                      </Btn>
                    )}
                  </>
                ) : (
                  <span style={{ fontWeight:700, fontSize:16, color:'var(--accent)' }}>{t} turn{t !== 1 ? 's' : ''}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function MGR() {
  const { isAdmin, isStaff, auth } = useAuth()
  const qc = useQueryClient()
  const [tab, setTab]         = useState('schedule')
  const [toast, setToast]     = useState(null)
  const [editSlot, setEditSlot] = useState(null)
  const [showAgreement, setShowAgreement] = useState(false)
  const [myMemberId, setMyMemberId] = useState(null)

  const notify = (msg, type='ok') => { setToast({msg,type}); setTimeout(()=>setToast(null),3500) }

  const { data: schedule, isLoading } = useQuery({
    queryKey: ['mgrSchedule'], queryFn: getMgrSchedule,
  })
  const { data: config } = useQuery({ queryKey: ['mgrConfig'], queryFn: getMgrConfig })
  const { data: agreement } = useQuery({ queryKey: ['mgrAgreement'], queryFn: getMgrAgreement })

  // Resolve current user's member_id from schedule turns
  const myTurn = useMemo(() => {
    if (!schedule?.turns || !auth?.user?.id) return null
    // turns come with member_id; we need to match via members in schedule
    return null // resolved via membership below
  }, [schedule, auth])

  // Get members list for admin panel
  const allMembers = useMemo(() => {
    if (!schedule?.turns) return []
    return schedule.turns.map(t => ({ id: t.member_id, name: t.name, member_id: t.member_code }))
  }, [schedule])

  // Find current user's member record from turns
  const myTurnEntry = useMemo(() => {
    if (!schedule?.turns) return null
    // We need userId→memberId mapping. The turns have member_id but not user_id.
    // Best effort: check if schedule contains a member linked to current user.
    // Since we don't have user_id in turns, we rely on what server sends.
    return null
  }, [schedule])

  // Mutations
  const claimMut = useMutation({
    mutationFn: claimMgrSlot,
    onSuccess: () => { qc.invalidateQueries({ queryKey:['mgrSchedule'] }); notify('Slot claimed! 🎉') },
    onError:   e  => notify(e.response?.data?.error || 'Could not claim slot', 'err'),
  })
  const updateSlotMut = useMutation({
    mutationFn: ({ id, data }) => updateMgrSlot(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey:['mgrSchedule'] }); setEditSlot(null); notify('Slot updated') },
    onError:   e  => notify(e.response?.data?.error || 'Update failed', 'err'),
  })
  const genMut = useMutation({
    mutationFn: generateMgrSchedule,
    onSuccess: r => { qc.invalidateQueries({ queryKey:['mgrSchedule'] }); notify(`Schedule generated: ${r.total_cycles} cycles · ${r.total_slots} slots · ${ksh(r.payout_per_slot)}/slot`) },
    onError:   e => notify(e.response?.data?.error || 'Generation failed','err'),
  })
  const autoMut = useMutation({
    mutationFn: autoAssignMgr,
    onSuccess: r => { qc.invalidateQueries({ queryKey:['mgrSchedule'] }); notify(`Auto-assigned ${r.assigned} slots`) },
    onError:   e => notify(e.response?.data?.error || 'Auto-assign failed','err'),
  })
  const turnsMut = useMutation({
    mutationFn: ({ member_id, turns_total }) => setMgrTurns({ member_id, turns_total }),
    onSuccess: () => { qc.invalidateQueries({ queryKey:['mgrSchedule'] }); notify('Turns updated') },
    onError:   e => notify(e.response?.data?.error || 'Update failed','err'),
  })

  const cycles  = schedule?.cycles  || []
  const turns   = schedule?.turns   || []
  const cfg     = schedule?.config  || config || {}

  // ── Summary stats ──────────────────────────────────────────────────────
  const totalSlots  = cycles.reduce((s, c) => s + (c.slots?.length || 0), 0)
  const paidSlots   = cycles.reduce((s, c) => s + c.slots.filter(sl => sl.status === 'paid').length, 0)
  const openSlots   = cycles.reduce((s, c) => s + c.slots.filter(sl => sl.status === 'open').length, 0)
  const claimedSlots= cycles.reduce((s, c) => s + c.slots.filter(sl => sl.status === 'claimed' || sl.status === 'auto_assigned').length, 0)
  const payoutEach  = cycles[0]?.payout_per_slot || cfg?.mgr_contribution_amount || 0

  const tabs = [
    { id:'schedule', label:'📅 Schedule' },
    { id:'turns',    label:'🔄 Turns' },
    ...(isAdmin ? [{ id:'admin', label:'⚙️ Admin' }] : []),
  ]

  if (isLoading) return <Loader />

  return (
    <div>
      <PageHeader
        title="Merry-Go-Round"
        sub={`${freqLabel[cfg.mgr_frequency||'monthly']} · ${cfg.mgr_recipients_per_cycle||1} recipient${(cfg.mgr_recipients_per_cycle||1)>1?'s':''}/cycle`}
        action={
          !agreement && (
            <Btn variant="primary" onClick={() => setShowAgreement(true)}>
              Sign Agreement
            </Btn>
          )
        }
      />

      {/* Stats row */}
      <div className="grid-metrics" style={{ marginBottom:24 }}>
        {[
          { label:'Total cycles', value: cycles.length, accent:'green' },
          { label:'Total slots',  value: totalSlots,    accent:'blue'  },
          { label:'Filled',       value: claimedSlots,  accent:'warn'  },
          { label:'Paid out',     value: paidSlots,     accent:'purple'},
          { label:'Payout/slot',  value: ksh(payoutEach), accent:'green' },
        ].map(({ label, value, accent }) => (
          <div key={label} style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '14px 18px',
          }}>
            <div style={{ fontSize:11, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'.5px' }}>{label}</div>
            <div style={{ fontSize:20, fontWeight:800, color:'var(--accent)', marginTop:4 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:20, background:'var(--card)',
        border:'1px solid var(--border)', borderRadius:10, padding:4, width:'fit-content', flexWrap:'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding:'7px 16px', borderRadius:7, border:'none', cursor:'pointer',
            fontWeight:600, fontSize:13,
            background: tab===t.id ? 'var(--accent)' : 'transparent',
            color:      tab===t.id ? '#fff'          : 'var(--muted)',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── SCHEDULE TAB ── */}
      {tab === 'schedule' && (
        <>
          {cycles.length === 0 ? (
            <EmptyState
              icon="🔄"
              title="No schedule yet"
              body={isAdmin
                ? 'Configure MGR cycle settings, then click Generate Schedule.'
                : 'Admin hasn\'t generated the schedule yet.'}
            />
          ) : (
            <div>
              {/* Progress bar */}
              {totalSlots > 0 && (
                <div style={{ marginBottom:20 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--muted)', marginBottom:6 }}>
                    <span>Overall progress</span>
                    <span>{paidSlots}/{totalSlots} slots paid ({Math.round(paidSlots/totalSlots*100)}%)</span>
                  </div>
                  <div style={{ background:'var(--border)', borderRadius:100, height:8 }}>
                    <div style={{ width:`${(paidSlots/totalSlots)*100}%`, height:'100%',
                      background:'var(--accent)', borderRadius:100,
                      transition:'width .5s cubic-bezier(.4,0,.2,1)' }} />
                  </div>
                </div>
              )}

              {cycles.map(cycle => (
                <CycleRow
                  key={cycle.id || cycle.cycle_number}
                  cycle={cycle}
                  myMemberId={myMemberId}
                  isAdmin={isAdmin}
                  isStaff={isStaff}
                  onClaim={id => claimMut.mutate(id)}
                  onAdminUpdate={slot => setEditSlot(slot)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── TURNS TAB ── */}
      {tab === 'turns' && (
        <>
          {allMembers.length === 0 ? (
            <EmptyState icon="👥" title="No members yet" body="Members appear here once the schedule is generated." />
          ) : (
            <>
              {/* Config summary */}
              <div style={{ marginBottom:16, padding:'12px 16px', background:'var(--card)',
                borderRadius:10, border:'1px solid var(--border)', fontSize:13 }}>
                <strong>How multi-turns work:</strong> A member with 2 turns pays{' '}
                <strong>2× the contribution</strong> per cycle and receives the payout twice
                over the course of the schedule. The total pool and payout per slot stay consistent.
              </div>
              <TurnsPanel
                turns={turns}
                members={allMembers}
                isAdmin={isAdmin}
                onSave={(memberId, turnsTotal) => turnsMut.mutate({ member_id: memberId, turns_total: turnsTotal })}
              />
            </>
          )}
        </>
      )}

      {/* ── ADMIN TAB ── */}
      {tab === 'admin' && isAdmin && (
        <>
          <Card>
            <CardTitle>Schedule management</CardTitle>
            <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:16 }}>
              <Btn variant="primary" onClick={() => genMut.mutate()} disabled={genMut.isPending}>
                {genMut.isPending ? '⏳ Generating…' : '🔄 Generate / Rebuild Schedule'}
              </Btn>
              <Btn onClick={() => autoMut.mutate()} disabled={autoMut.isPending}>
                {autoMut.isPending ? '⏳ Assigning…' : '⚡ Auto-assign open slots'}
              </Btn>
            </div>
            {genMut.data && (
              <div style={{ padding:'12px 16px', background:'var(--surface2)', borderRadius:10,
                border:'1px solid var(--border)', fontSize:13, display:'grid',
                gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:12 }}>
                {[
                  ['Members',      genMut.data.total_members],
                  ['Total slots',  genMut.data.total_slots],
                  ['Cycles',       genMut.data.total_cycles],
                  ['Recipients/cycle', genMut.data.recipients_per_cycle],
                  ['Payout/slot',  ksh(genMut.data.payout_per_slot)],
                  ['Pool/cycle',   ksh(genMut.data.contrib_per_cycle)],
                  ['Frequency',    freqLabel[genMut.data.frequency]],
                  ['Start date',   genMut.data.start_date],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div style={{ fontSize:11, color:'var(--muted)', fontWeight:600, textTransform:'uppercase' }}>{label}</div>
                    <div style={{ fontSize:15, fontWeight:700, color:'var(--accent)', marginTop:3 }}>{value}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardTitle>All slots overview</CardTitle>
            <Table
              heads={['Cycle','Date','Slot','Member','Amount','Status','Action']}
              empty="No slots — generate the schedule first"
              rows={cycles.flatMap(c => c.slots.map(s => (
                <Tr key={s.id}>
                  <Td bold>{c.cycle_number}</Td>
                  <Td>{c.scheduled_date ? new Date(c.scheduled_date).toLocaleDateString('en-KE',{day:'numeric',month:'short'}) : '—'}</Td>
                  <Td>{s.slot_number}</Td>
                  <Td>{s.member_name || <span style={{color:'var(--muted)',fontStyle:'italic'}}>open</span>}</Td>
                  <Td mono>{ksh(s.payout_amount)}</Td>
                  <Td><SlotBadge status={s.status} /></Td>
                  <Td>
                    <Btn size="sm" onClick={() => setEditSlot(s)}>Edit</Btn>
                  </Td>
                </Tr>
              )))}
            />
          </Card>
        </>
      )}

      {/* ── Modals ── */}
      {editSlot && (
        <SlotEditModal
          slot={editSlot}
          members={allMembers}
          onClose={() => setEditSlot(null)}
          onSave={data => updateSlotMut.mutate({ id: editSlot.id, data })}
        />
      )}
      {showAgreement && (
        <MgrAgreementModal
          onClose={() => setShowAgreement(false)}
          onDone={() => { setShowAgreement(false); qc.invalidateQueries({ queryKey:['mgrAgreement'] }); notify('Agreement signed ✓') }}
        />
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
