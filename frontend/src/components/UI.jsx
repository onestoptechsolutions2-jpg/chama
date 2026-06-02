import React from 'react'

export const ksh       = n  => 'Ksh ' + Number(n||0).toLocaleString()
export const initials  = n  => (n||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()

export function Avatar({ name='?', size=32 }) {
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:'var(--accent-lt)', color:'var(--accent)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*0.3, fontWeight:600, flexShrink:0 }}>
      {initials(name)}
    </div>
  )
}

const bv = { ok:'#e8f5e9|#2e7d32', warn:'#fef9e7|#b8860b', danger:'#fdecea|#c0392b', info:'#e8f0ea|#2d5a3d', purple:'#ede7f6|#4527a0', grey:'#f0ede6|#7a7168' }
export function Badge({ variant='grey', children }) {
  const [bg,color] = (bv[variant]||bv.grey).split('|')
  return <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, fontWeight:500, padding:'2px 8px', borderRadius:100, background:bg, color }}>{children}</span>
}

export function Btn({ variant='default', size='md', onClick, disabled, children, style:s={} }) {
  const base = { display:'inline-flex', alignItems:'center', gap:6, border:'1px solid var(--border)', borderRadius:'var(--r)', fontFamily:'inherit', fontWeight:500, cursor:disabled?'not-allowed':'pointer', opacity:disabled?0.5:1, transition:'all .15s', padding:size==='sm'?'5px 10px':'8px 16px', fontSize:size==='sm'?12:13 }
  const vs = { default:{ background:'var(--surface)', color:'var(--text)' }, primary:{ background:'var(--accent)', color:'#fff', borderColor:'var(--accent)' }, danger:{ background:'var(--danger)', color:'#fff', borderColor:'var(--danger)' } }
  return <button style={{ ...base, ...(vs[variant]||vs.default), ...s }} onClick={onClick} disabled={disabled}>{children}</button>
}

export function Card({ children, style:s={} }) {
  return <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r-lg)', padding:18, marginBottom:14, ...s }}>{children}</div>
}
export function CardTitle({ children }) {
  return <div style={{ fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'.6px', color:'var(--muted)', marginBottom:14 }}>{children}</div>
}

export function PageHeader({ title, sub, action }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24 }}>
      <div><h1 style={{ fontSize:22, fontWeight:600 }}>{title}</h1>{sub && <p style={{ color:'var(--muted)', fontSize:13, marginTop:3 }}>{sub}</p>}</div>
      {action}
    </div>
  )
}

export function Input({ label, ...p }) {
  return (
    <div style={{ marginBottom:12 }}>
      {label && <label style={{ display:'block', fontSize:12, fontWeight:500, color:'var(--muted)', marginBottom:5 }}>{label}</label>}
      <input style={{ width:'100%', padding:'9px 11px', border:'1px solid var(--border)', borderRadius:'var(--r)', fontFamily:'inherit', fontSize:13, background:'var(--surface)', color:'var(--text)', outline:'none' }} {...p} />
    </div>
  )
}

export function Sel({ label, children, ...p }) {
  return (
    <div style={{ marginBottom:12 }}>
      {label && <label style={{ display:'block', fontSize:12, fontWeight:500, color:'var(--muted)', marginBottom:5 }}>{label}</label>}
      <select style={{ width:'100%', padding:'9px 11px', border:'1px solid var(--border)', borderRadius:'var(--r)', fontFamily:'inherit', fontSize:13, background:'var(--surface)', color:'var(--text)', outline:'none' }} {...p}>{children}</select>
    </div>
  )
}

export function Grid2({ children }) { return <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>{children}</div> }
export function Grid4({ children }) { return <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16 }}>{children}</div> }

export function Metric({ label, value, sub }) {
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r-lg)', padding:16 }}>
      <div style={{ fontSize:11, color:'var(--muted)', marginBottom:6, fontWeight:500 }}>{label}</div>
      <div style={{ fontSize:20, fontWeight:600, fontFamily:"'DM Mono',monospace" }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'var(--muted)', marginTop:3 }}>{sub}</div>}
    </div>
  )
}

export function Table({ heads, rows, empty='No data' }) {
  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
        <thead><tr>{heads.map(h => <th key={h} style={{ textAlign:'left', padding:'8px 12px', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'.5px', color:'var(--muted)', borderBottom:'1px solid var(--border)' }}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0
            ? <tr><td colSpan={heads.length} style={{ textAlign:'center', padding:32, color:'var(--muted)' }}>{empty}</td></tr>
            : rows}
        </tbody>
      </table>
    </div>
  )
}

export function Tr({ children }) {
  return (
    <tr onMouseEnter={e=>e.currentTarget.style.background='var(--surface2)'} onMouseLeave={e=>e.currentTarget.style.background=''}>
      {children}
    </tr>
  )
}
export function Td({ children, mono, bold }) {
  return <td style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)', fontFamily:mono?"'DM Mono',monospace":'inherit', fontWeight:bold?600:400, verticalAlign:'middle' }}>{children}</td>
}

export function Loader({ text='Loading...' }) {
  return (
    <div style={{ textAlign:'center', padding:48, color:'var(--muted)' }}>
      <style>{`@keyframes sp{to{transform:rotate(360deg)}}`}</style>
      <span style={{ display:'inline-block', width:18, height:18, border:'2px solid var(--border)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'sp .7s linear infinite', marginRight:8, verticalAlign:'middle' }} />
      {text}
    </div>
  )
}

export function Toast({ msg, type='ok' }) {
  if (!msg) return null
  return <div style={{ position:'fixed', bottom:20, right:20, zIndex:999, background:type==='err'?'var(--danger)':'var(--text)', color:'#fff', padding:'10px 18px', borderRadius:'var(--r)', fontSize:13, fontWeight:500, boxShadow:'0 2px 12px rgba(0,0,0,.15)' }}>{msg}</div>
}
