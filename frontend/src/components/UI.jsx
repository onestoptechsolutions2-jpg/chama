import React from 'react'

export const ksh      = n  => 'Ksh ' + Number(n||0).toLocaleString()
export const initials = n  => (n||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()

// ── Avatar ─────────────────────────────────────────────────────
export function Avatar({ name='?', size=32 }) {
  return (
    <div style={{
      width:size, height:size, borderRadius:'50%',
      background:'var(--accent-lt)', color:'var(--accent)',
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:size*0.3, fontWeight:700, flexShrink:0, letterSpacing:'-.5px',
    }}>
      {initials(name)}
    </div>
  )
}

// ── Badge ──────────────────────────────────────────────────────
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
      fontSize:11, fontWeight:600, padding:'2px 9px',
      borderRadius:100, background:bg, color,
    }}>
      {children}
    </span>
  )
}

// ── Button ─────────────────────────────────────────────────────
export function Btn({ variant='default', size='md', onClick, disabled, children, style:s={} }) {
  const base = {
    display:'inline-flex', alignItems:'center', gap:6,
    border:'1px solid var(--border)', borderRadius:'var(--r)',
    fontFamily:'inherit', fontWeight:500,
    cursor:disabled?'not-allowed':'pointer', opacity:disabled?0.55:1,
    transition:'all .15s',
    padding:size==='sm'?'5px 10px':'8px 16px',
    fontSize:size==='sm'?12:13,
  }
  const vs = {
    default:{ background:'var(--surface)', color:'var(--text)' },
    primary:{ background:'var(--accent)', color:'#fff', borderColor:'var(--accent)' },
    danger: { background:'var(--danger)', color:'#fff', borderColor:'var(--danger)' },
  }
  return (
    <button style={{ ...base, ...(vs[variant]||vs.default), ...s }} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

// ── Card ───────────────────────────────────────────────────────
export function Card({ children, style:s={} }) {
  return (
    <div style={{
      background:'var(--surface)', border:'1px solid var(--border)',
      borderRadius:'var(--r-lg)', padding:18, marginBottom:14, ...s,
    }}>
      {children}
    </div>
  )
}
export function CardTitle({ children, action }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
      <div style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'.6px', color:'var(--muted)' }}>
        {children}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

// ── Page header ────────────────────────────────────────────────
export function PageHeader({ title, sub, action }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24 }}>
      <div>
        <h1 style={{ fontSize:22, fontWeight:600 }}>{title}</h1>
        {sub && <p style={{ color:'var(--muted)', fontSize:13, marginTop:3 }}>{sub}</p>}
      </div>
      {action}
    </div>
  )
}

// ── Input / Select ─────────────────────────────────────────────
export function Input({ label, ...p }) {
  return (
    <div style={{ marginBottom:12 }}>
      {label && <label style={{ display:'block', fontSize:12, fontWeight:500, color:'var(--muted)', marginBottom:5 }}>{label}</label>}
      <input style={{
        width:'100%', padding:'9px 11px', border:'1.5px solid var(--border)',
        borderRadius:'var(--r)', fontFamily:'inherit', fontSize:13,
        background:'var(--surface)', color:'var(--text)', outline:'none',
        transition:'border-color .15s',
      }} {...p} />
    </div>
  )
}

export function Sel({ label, children, ...p }) {
  return (
    <div style={{ marginBottom:12 }}>
      {label && <label style={{ display:'block', fontSize:12, fontWeight:500, color:'var(--muted)', marginBottom:5 }}>{label}</label>}
      <select style={{
        width:'100%', padding:'9px 11px', border:'1.5px solid var(--border)',
        borderRadius:'var(--r)', fontFamily:'inherit', fontSize:13,
        background:'var(--surface)', color:'var(--text)', outline:'none',
      }} {...p}>
        {children}
      </select>
    </div>
  )
}

// ── Grid helpers ───────────────────────────────────────────────
export function Grid2({ children }) {
  return <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>{children}</div>
}
export function Grid4({ children }) {
  return <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16 }}>{children}</div>
}

// ── Metric card ────────────────────────────────────────────────
// accent: 'green'|'yellow'|'red'|'blue'|undefined
const accentMap = {
  green:  { bg:'#e8f0ea', bar:'var(--accent)' },
  yellow: { bg:'#fef9e7', bar:'#b8860b' },
  red:    { bg:'#fdecea', bar:'var(--danger)' },
  blue:   { bg:'#e8f4fd', bar:'#1565c0' },
}
export function Metric({ label, value, sub, accent, progress }) {
  const ac = accentMap[accent]
  return (
    <div style={{
      background: ac ? ac.bg : 'var(--surface)',
      border:'1px solid var(--border)',
      borderRadius:'var(--r-lg)', padding:16,
      position:'relative', overflow:'hidden',
    }}>
      {ac && (
        <div style={{
          position:'absolute', top:0, left:0, right:0, height:3,
          background:ac.bar, borderRadius:'var(--r-lg) var(--r-lg) 0 0',
        }} />
      )}
      <div style={{ fontSize:11, color:'var(--muted)', marginBottom:7, fontWeight:500 }}>{label}</div>
      <div style={{ fontSize:20, fontWeight:600, fontFamily:"'DM Mono',monospace" }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>{sub}</div>}
      {progress != null && (
        <div style={{ marginTop:10 }}>
          <ProgressBar value={progress} color={ac?.bar || 'var(--accent)'} height={4} />
        </div>
      )}
    </div>
  )
}

// ── Progress bar ───────────────────────────────────────────────
export function ProgressBar({ value=0, max=100, color='var(--accent)', height=6, label }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div>
      {label && (
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--muted)', marginBottom:5 }}>
          <span>{label}</span>
          <span>{Math.round(pct)}%</span>
        </div>
      )}
      <div style={{ background:'var(--border)', borderRadius:100, overflow:'hidden', height }}>
        <div style={{ width:`${pct}%`, height:'100%', background:color, borderRadius:100, transition:'width .4s ease' }} />
      </div>
    </div>
  )
}

// ── Empty state ────────────────────────────────────────────────
export function EmptyState({ icon='📭', title='Nothing here yet', body }) {
  return (
    <div style={{ textAlign:'center', padding:'40px 20px', color:'var(--muted)' }}>
      <div style={{ fontSize:36, marginBottom:12 }}>{icon}</div>
      <div style={{ fontSize:14, fontWeight:500, color:'var(--text)', marginBottom:body?6:0 }}>{title}</div>
      {body && <div style={{ fontSize:13 }}>{body}</div>}
    </div>
  )
}

// ── Table ──────────────────────────────────────────────────────
export function Table({ heads, rows, empty='No data' }) {
  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
        <thead>
          <tr>
            {heads.map(h => (
              <th key={h} style={{
                textAlign:'left', padding:'8px 12px',
                fontSize:11, fontWeight:600, textTransform:'uppercase',
                letterSpacing:'.5px', color:'var(--muted)',
                borderBottom:'1px solid var(--border)',
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
      style={{ cursor: onClick ? 'pointer' : undefined }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
      onMouseLeave={e => e.currentTarget.style.background = ''}
    >
      {children}
    </tr>
  )
}
export function Td({ children, mono, bold }) {
  return (
    <td style={{
      padding:'10px 12px', borderBottom:'1px solid var(--border)',
      fontFamily: mono ? "'DM Mono',monospace" : 'inherit',
      fontWeight: bold ? 600 : 400, verticalAlign:'middle',
    }}>
      {children}
    </td>
  )
}

// ── Loader ─────────────────────────────────────────────────────
export function Loader({ text='Loading…' }) {
  return (
    <div style={{ textAlign:'center', padding:48, color:'var(--muted)' }}>
      <style>{`@keyframes sp{to{transform:rotate(360deg)}}`}</style>
      <span style={{
        display:'inline-block', width:18, height:18,
        border:'2px solid var(--border)', borderTopColor:'var(--accent)',
        borderRadius:'50%', animation:'sp .7s linear infinite',
        marginRight:8, verticalAlign:'middle',
      }} />
      {text}
    </div>
  )
}

// ── Toast ──────────────────────────────────────────────────────
export function Toast({ msg, type='ok' }) {
  if (!msg) return null
  const isErr = type === 'err'
  return (
    <div style={{
      position:'fixed', bottom:24, right:24, zIndex:999,
      background: isErr ? 'var(--danger)' : 'var(--accent)',
      color:'#fff', padding:'11px 20px',
      borderRadius:'var(--r)', fontSize:13, fontWeight:500,
      boxShadow:'0 4px 16px rgba(0,0,0,.18)',
      display:'flex', alignItems:'center', gap:8,
      animation:'slideUp .2s ease',
    }}>
      <span>{isErr ? '✕' : '✓'}</span>
      {msg}
      <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  )
}

// ── Section divider ────────────────────────────────────────────
export function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize:10, fontWeight:600, textTransform:'uppercase',
      letterSpacing:'.8px', color:'var(--muted)', padding:'16px 0 8px',
    }}>
      {children}
    </div>
  )
}
