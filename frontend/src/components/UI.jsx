import React from 'react'

export const ksh      = n  => 'Ksh ' + Number(n||0).toLocaleString()
export const initials = n  => (n||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()

// ── Avatar ──────────────────────────────────────────────────────
export function Avatar({ name='?', size=32 }) {
  return (
    <div style={{
      width:size, height:size, borderRadius:'50%',
      background:'var(--accent-lt)', color:'var(--accent)',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:Math.max(10, size*0.3), fontWeight:700, flexShrink:0, letterSpacing:'-.5px',
    }}>
      {initials(name)}
    </div>
  )
}

// ── Badge ────────────────────────────────────────────────────────
const bv = {
  ok:    '#e8f5e9|#2e7d32',
  warn:  '#fef9e7|#b8860b',
  danger:'#fdecea|#c0392b',
  info:  '#e8f0ea|#2d5a3d',
  purple:'#ede7f6|#4527a0',
  grey:  '#f0ede6|#7a7168',
  blue:  '#e8f4fd|#1565c0',
}
export function Badge({ variant='grey', children }) {
  const [bg,color] = (bv[variant]||bv.grey).split('|')
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:4,
      fontSize:'var(--text-xs)', fontWeight:600, padding:'2px 9px',
      borderRadius:100, background:bg, color, whiteSpace:'nowrap',
    }}>
      {children}
    </span>
  )
}

// ── Button ────────────────────────────────────────────────────────
export function Btn({ variant='default', size='md', onClick, disabled, children, style:s={}, type='button' }) {
  const base = {
    display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6,
    border:'1.5px solid var(--border)', borderRadius:'var(--r)',
    fontFamily:'inherit', fontWeight:600,
    cursor:disabled?'not-allowed':'pointer', opacity:disabled?0.55:1,
    padding: size==='sm' ? 'clamp(4px,.4vw,6px) clamp(8px,.8vw,12px)'
                         : 'clamp(8px,.8vw,10px) clamp(12px,1.2vw,18px)',
    fontSize: size==='sm' ? 'var(--text-xs)' : 'var(--text-sm)',
    lineHeight: 1.3,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  }
  const vs = {
    default:{ background:'var(--surface)', color:'var(--text)' },
    primary:{ background:'var(--accent)', color:'#fff', borderColor:'var(--accent)' },
    danger: { background:'var(--danger)', color:'#fff', borderColor:'var(--danger)' },
  }
  return (
    <button type={type} style={{ ...base, ...(vs[variant]||vs.default), ...s }} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

// ── Card ──────────────────────────────────────────────────────────
export function Card({ children, style:s={} }) {
  return (
    <div className="card" style={s}>
      {children}
    </div>
  )
}

export function CardTitle({ children, action }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'var(--sp-3)', flexWrap:'wrap', gap:8 }}>
      <div style={{ fontSize:'var(--text-xs)', fontWeight:700, textTransform:'uppercase', letterSpacing:'.7px', color:'var(--muted)' }}>
        {children}
      </div>
      {action && <div style={{ flexShrink:0 }}>{action}</div>}
    </div>
  )
}

// ── Page header ────────────────────────────────────────────────────
export function PageHeader({ title, sub, action }) {
  return (
    <div className="page-header">
      <div>
        <h1 style={{ fontSize:'var(--text-xl)', fontWeight:700, letterSpacing:'-.3px', lineHeight:1.2 }}>{title}</h1>
        {sub && <p style={{ color:'var(--muted)', fontSize:'var(--text-sm)', marginTop:4 }}>{sub}</p>}
      </div>
      {action && <div style={{ flexShrink:0 }}>{action}</div>}
    </div>
  )
}

// ── Input / Select ─────────────────────────────────────────────────
const fieldBase = {
  width:'100%', border:'1.5px solid var(--border)',
  borderRadius:'var(--r)', fontFamily:'inherit',
  background:'var(--surface)', color:'var(--text)', outline:'none',
  padding:'clamp(8px,.8vw,10px) clamp(10px,1vw,13px)',
  fontSize:'var(--text-base)',
}

export function Input({ label, ...p }) {
  return (
    <div style={{ marginBottom:'var(--sp-3)' }}>
      {label && <label style={{ display:'block', fontSize:'var(--text-xs)', fontWeight:600, color:'var(--text)', marginBottom:5 }}>{label}</label>}
      <input style={fieldBase} {...p} />
    </div>
  )
}

export function Sel({ label, children, ...p }) {
  return (
    <div style={{ marginBottom:'var(--sp-3)' }}>
      {label && <label style={{ display:'block', fontSize:'var(--text-xs)', fontWeight:600, color:'var(--text)', marginBottom:5 }}>{label}</label>}
      <select style={{ ...fieldBase, cursor:'pointer' }} {...p}>
        {children}
      </select>
    </div>
  )
}

// ── Grid helpers ───────────────────────────────────────────────────
export function Grid2({ children, style:s={} }) {
  return (
    <div className="grid-2" style={s}>
      {children}
    </div>
  )
}
export function Grid4({ children, style:s={} }) {
  return (
    <div className="grid-4" style={s}>
      {children}
    </div>
  )
}

// ── Metric card ────────────────────────────────────────────────────
const accentMap = {
  green:  { bg:'#e8f0ea', bar:'var(--accent)' },
  yellow: { bg:'#fef9e7', bar:'#b8860b' },
  red:    { bg:'#fdecea', bar:'var(--danger)' },
  blue:   { bg:'#e8f4fd', bar:'#1565c0' },
  purple: { bg:'#ede7f6', bar:'#4527a0' },
}
export function Metric({ label, value, sub, accent, progress }) {
  const ac = accentMap[accent]
  return (
    <div style={{
      background: ac ? ac.bg : 'var(--surface)',
      border:'1px solid var(--border)',
      borderRadius:'var(--r-lg)', padding:'var(--sp-4)',
      position:'relative', overflow:'hidden',
      boxShadow:'var(--shadow-sm)',
    }}>
      {ac && (
        <div style={{
          position:'absolute', top:0, left:0, right:0, height:3,
          background:ac.bar, borderRadius:'var(--r-lg) var(--r-lg) 0 0',
        }} />
      )}
      <div style={{ fontSize:'var(--text-xs)', color:'var(--muted)', marginBottom:8, fontWeight:600, textTransform:'uppercase', letterSpacing:'.5px' }}>
        {label}
      </div>
      <div style={{ fontSize:'var(--text-lg)', fontWeight:700, fontFamily:"'DM Mono',monospace", letterSpacing:'-.5px' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize:'var(--text-xs)', color:'var(--muted)', marginTop:5 }}>{sub}</div>}
      {progress != null && (
        <div style={{ marginTop:10 }}>
          <ProgressBar value={progress} color={ac?.bar || 'var(--accent)'} height={4} />
        </div>
      )}
    </div>
  )
}

// ── Progress bar ────────────────────────────────────────────────────
export function ProgressBar({ value=0, max=100, color='var(--accent)', height=6, label }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div>
      {label && (
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:'var(--text-xs)', color:'var(--muted)', marginBottom:5 }}>
          <span>{label}</span>
          <span>{Math.round(pct)}%</span>
        </div>
      )}
      <div style={{ background:'var(--border)', borderRadius:100, overflow:'hidden', height }}>
        <div style={{ width:`${pct}%`, height:'100%', background:color, borderRadius:100, transition:'width .5s cubic-bezier(.4,0,.2,1)' }} />
      </div>
    </div>
  )
}

// ── Empty state ──────────────────────────────────────────────────────
export function EmptyState({ icon='📭', title='Nothing here yet', body }) {
  return (
    <div style={{ textAlign:'center', padding:'clamp(28px,5vw,52px) 20px', color:'var(--muted)' }}>
      <div style={{ fontSize:'clamp(28px,4vw,40px)', marginBottom:12 }}>{icon}</div>
      <div style={{ fontSize:'var(--text-md)', fontWeight:600, color:'var(--text)', marginBottom:body?6:0 }}>{title}</div>
      {body && <div style={{ fontSize:'var(--text-sm)', maxWidth:320, margin:'0 auto', lineHeight:1.6 }}>{body}</div>}
    </div>
  )
}

// ── Table ─────────────────────────────────────────────────────────────
export function Table({ heads, rows, empty='No data' }) {
  return (
    <div className="table-wrap">
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'var(--text-sm)' }}>
        <thead>
          <tr style={{ background:'var(--surface2)' }}>
            {heads.map(h => (
              <th key={h} style={{
                textAlign:'left', padding:'clamp(7px,.7vw,10px) clamp(10px,1vw,14px)',
                fontSize:'var(--text-xs)', fontWeight:700, textTransform:'uppercase',
                letterSpacing:'.6px', color:'var(--muted)',
                borderBottom:'2px solid var(--border)', whiteSpace:'nowrap',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0
            ? <tr><td colSpan={heads.length}><EmptyState icon="📋" title={empty} /></td></tr>
            : rows}
        </tbody>
      </table>
    </div>
  )
}

export function Tr({ children, onClick }) {
  return (
    <tr
      onClick={onClick}
      style={{ cursor:onClick?'pointer':undefined }}
      onMouseEnter={e => e.currentTarget.style.background='var(--surface2)'}
      onMouseLeave={e => e.currentTarget.style.background=''}
    >
      {children}
    </tr>
  )
}

export function Td({ children, mono, bold }) {
  return (
    <td style={{
      padding:'clamp(9px,.9vw,12px) clamp(10px,1vw,14px)',
      borderBottom:'1px solid var(--border)',
      fontFamily: mono ? "'DM Mono',monospace" : 'inherit',
      fontWeight: bold ? 700 : 400,
      verticalAlign:'middle',
      fontSize:'var(--text-sm)',
    }}>
      {children}
    </td>
  )
}

// ── Loader ────────────────────────────────────────────────────────────
export function Loader({ text='Loading…' }) {
  return (
    <div style={{ textAlign:'center', padding:'clamp(32px,5vw,56px)', color:'var(--muted)' }}>
      <span style={{
        display:'inline-block', width:18, height:18,
        border:'2.5px solid var(--border)', borderTopColor:'var(--accent)',
        borderRadius:'50%', animation:'spin .7s linear infinite',
        marginRight:8, verticalAlign:'middle',
      }} />
      {text}
    </div>
  )
}

// ── Toast ──────────────────────────────────────────────────────────────
export function Toast({ msg, type='ok' }) {
  if (!msg) return null
  const isErr = type === 'err'
  return (
    <div className="toast" style={{
      background: isErr ? 'var(--danger)' : 'var(--accent)',
      color:'#fff', padding:'11px 18px',
      borderRadius:'var(--r)', fontSize:'var(--text-sm)', fontWeight:600,
      boxShadow:'var(--shadow-lg)',
      display:'flex', alignItems:'center', gap:8,
    }}>
      <span>{isErr ? '✕' : '✓'}</span>
      {msg}
    </div>
  )
}

// ── Section label ──────────────────────────────────────────────────────
export function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize:'var(--text-xs)', fontWeight:700, textTransform:'uppercase',
      letterSpacing:'.8px', color:'var(--muted)', padding:'var(--sp-4) 0 var(--sp-2)',
    }}>
      {children}
    </div>
  )
}

// ── Stat row ───────────────────────────────────────────────────────────
// Horizontal key-value pair used in detail panels
export function StatRow({ label, value, mono }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 0', borderBottom:'1px solid var(--border)' }}>
      <span style={{ fontSize:'var(--text-sm)', color:'var(--muted)' }}>{label}</span>
      <span style={{
        fontSize:'var(--text-sm)', fontWeight:600, color:'var(--text)',
        fontFamily: mono ? "'DM Mono',monospace" : 'inherit',
      }}>{value}</span>
    </div>
  )
}
