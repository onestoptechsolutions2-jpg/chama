import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { signMgrAgreement } from '../api'

export default function MgrAgreementModal({ groupTerms, platformTerms, onClose, onSigned }) {
  const qc = useQueryClient()
  const [step, setStep]   = useState(0) // 0=platform 1=group 2=financial 3=sign
  const [checks, setChecks] = useState({ platform:false, group:false, financial:false })
  const [sig, setSig]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const mut = useMutation({ mutationFn: signMgrAgreement, onSuccess: () => qc.invalidateQueries({ queryKey:['mgr-agreement'] }) })

  const steps = [
    { title:'Platform Terms', key:'platform', content: platformTerms || DEFAULT_PLATFORM },
    { title:'Group Terms',    key:'group',    content: groupTerms    || 'No specific group terms set.' },
    { title:'Financial Acknowledgement', key:'financial', content: FINANCIAL_ACK },
    { title:'Digital Signature', key:'sign', content: null },
  ]

  const cur = steps[step]

  const handleSign = async () => {
    if (!sig.trim()) { setError('Please enter your name as digital signature'); return }
    setLoading(true)
    try {
      await mut.mutateAsync({
        platform_terms: true,
        group_terms: true,
        financial_acknowledged: true,
        digital_signature: sig.trim(),
      })
      onSigned?.()
      onClose()
    } catch(e) {
      setError(e.response?.data?.error || 'Failed to save agreement')
    } finally { setLoading(false) }
  }

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,.55)', zIndex:1000,
      display:'flex', alignItems:'center', justifyContent:'center', padding:16,
    }}>
      <div style={{
        background:'var(--card)', borderRadius:16, width:'100%', maxWidth:560,
        maxHeight:'90vh', display:'flex', flexDirection:'column', overflow:'hidden',
        boxShadow:'0 20px 60px rgba(0,0,0,.25)',
      }}>
        {/* Header */}
        <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontWeight:800, fontSize:17, color:'var(--text)' }}>MGR Terms & Conditions</div>
              <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>Step {step+1} of {steps.length}</div>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              {steps.map((_,i) => (
                <div key={i} style={{
                  width:10, height:10, borderRadius:'50%',
                  background: i < step ? '#16a34a' : i === step ? 'var(--accent)' : 'var(--border)',
                }} />
              ))}
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:'auto', padding:24 }}>
          <h3 style={{ margin:'0 0 14px', fontWeight:700, fontSize:16, color:'var(--text)' }}>{cur.title}</h3>

          {step < 3 && (
            <>
              <div style={{
                background:'var(--bg)', borderRadius:10, padding:'14px 16px', fontSize:13,
                color:'var(--text)', lineHeight:1.7, whiteSpace:'pre-wrap', marginBottom:20,
                border:'1px solid var(--border)', maxHeight:220, overflowY:'auto',
              }}>
                {cur.content}
              </div>
              <label style={{ display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer', fontSize:14, color:'var(--text)' }}>
                <input
                  type="checkbox"
                  checked={checks[cur.key]}
                  onChange={e => setChecks(c => ({ ...c, [cur.key]: e.target.checked }))}
                  style={{ marginTop:3, width:16, height:16, accentColor:'var(--accent)' }}
                />
                <span>I have read and agree to the <strong>{cur.title}</strong>.</span>
              </label>
            </>
          )}

          {step === 3 && (
            <div>
              <p style={{ fontSize:14, color:'var(--text)', lineHeight:1.6, marginBottom:20 }}>
                By entering your full name below you digitally sign and acknowledge all terms above.
              </p>
              <input
                value={sig}
                onChange={e => setSig(e.target.value)}
                placeholder="Type your full name"
                style={{
                  width:'100%', boxSizing:'border-box', padding:'12px 14px', borderRadius:9,
                  border:'1.5px solid var(--border)', background:'var(--bg)', color:'var(--text)',
                  fontSize:15, fontStyle:'italic',
                }}
              />
              {error && <div style={{ color:'#dc2626', fontSize:13, marginTop:10 }}>{error}</div>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'16px 24px', borderTop:'1px solid var(--border)', display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'10px 18px', border:'1px solid var(--border)', borderRadius:8, background:'none', color:'var(--muted)', fontWeight:600, fontSize:14, cursor:'pointer' }}>
            Cancel
          </button>
          {step < 3 ? (
            <button
              onClick={() => setStep(s => s+1)}
              disabled={!checks[cur.key]}
              style={{
                padding:'10px 20px', border:'none', borderRadius:8, fontWeight:700, fontSize:14, cursor:'pointer',
                background: checks[cur.key] ? 'var(--accent)' : 'var(--border)',
                color: checks[cur.key] ? '#fff' : 'var(--muted)',
              }}
            >
              Next →
            </button>
          ) : (
            <button onClick={handleSign} disabled={loading || !sig.trim()} style={{
              padding:'10px 20px', border:'none', borderRadius:8, fontWeight:700, fontSize:14, cursor:'pointer',
              background: sig.trim() ? '#16a34a' : 'var(--border)',
              color: sig.trim() ? '#fff' : 'var(--muted)',
            }}>
              {loading ? 'Signing…' : '✓ Sign & agree'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const DEFAULT_PLATFORM = `Welcome to Chama Manager Platform.

1. SERVICE — We provide a digital platform for managing savings groups (chamas) including contributions, loans, MGR rotations, and welfare.

2. FEES — A 5% platform fee applies on each MGR payout. This fee is charged to the group admin via M-Pesa STK Push before payout is processed.

3. DATA — Your financial data is stored securely. We do not share your personal information with third parties.

4. LIABILITY — Chama Manager is a tool to facilitate group management. All financial decisions remain the responsibility of the group and its members.

5. DISPUTES — Any disputes between members are handled within the group. Chama Manager is not liable for inter-member financial disputes.

By proceeding you accept these platform terms.`

const FINANCIAL_ACK = `FINANCIAL ACKNOWLEDGEMENT

I understand and acknowledge that:

• The MGR (Merry-Go-Round) rotation is a binding commitment. Once I enter the rotation I am expected to contribute until all members have received their payout.

• Missing contributions may result in fines as defined by the group rules.

• The 5% platform fee will be deducted from my MGR payout via M-Pesa STK Push.

• Loans taken against my savings are subject to interest and repayment schedules set by the group.

• My financial data within this platform is visible to the group admin and treasurer.

I confirm I have sufficient understanding of the financial commitment I am making.`
