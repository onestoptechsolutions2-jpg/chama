import { useState, useEffect, useCallback, useLayoutEffect, createContext, useContext } from 'react'
import { useAuth } from '../context/AuthContext'

const TOUR_KEY = 'chama_tour_v1'

// ── Step definitions ──────────────────────────────────────────────────────────

const STAFF_STEPS = [
  {
    id: 'welcome',
    target: null,
    title: 'Welcome to Chama Manager! 👋',
    body: "Let's take a 60-second tour of the key features. You can skip anytime with ✕.",
  },
  {
    id: 'sidebar',
    target: '[data-tour="sidebar"]',
    placement: 'right',
    title: 'Your navigation hub',
    body: 'All sections live here. What\'s visible adapts automatically to your group type — chama, welfare, hybrid, and so on.',
  },
  {
    id: 'dashboard',
    target: '[data-tour="nav-dashboard"]',
    placement: 'right',
    title: 'Dashboard',
    body: 'Live snapshot of your group — total savings, active loans, upcoming payouts, and recent transactions.',
  },
  {
    id: 'members',
    target: '[data-tour="nav-members"]',
    placement: 'right',
    title: 'Members',
    body: 'Add and manage group members, track individual contributions, and view loan eligibility at a glance.',
  },
  {
    id: 'loans',
    target: '[data-tour="nav-loans"]',
    placement: 'right',
    title: 'Loans',
    body: 'Process applications, set repayment schedules, record repayments, and track outstanding balances.',
  },
  {
    id: 'mgr',
    target: '[data-tour="nav-mgr"]',
    placement: 'right',
    title: 'Merry-Go-Round',
    body: 'Set up flexible rotation cycles. Choose frequency, number of recipients, and let members claim their preferred payout slot — or auto-assign them.',
  },
  {
    id: 'fines',
    target: '[data-tour="nav-fines"]',
    placement: 'right',
    title: 'Fines',
    body: 'Record fines for lateness, absence, or rule violations. Fines are linked to individual members.',
  },
  {
    id: 'settings',
    target: '[data-tour="nav-settings"]',
    placement: 'right',
    title: 'Settings',
    body: 'Configure contribution amounts, loan policy, MGR cycle frequency, fine amounts, and group details all in one place.',
  },
  {
    id: 'group-switcher',
    target: '[data-tour="group-switcher"]',
    placement: 'right',
    title: 'Group switcher',
    body: 'Member of multiple groups? Switch between them instantly without logging out.',
  },
  {
    id: 'done',
    target: null,
    title: "You're all set! 🎉",
    body: "Explore each section to get started. Tap the ❓ button in the bottom-right corner anytime to replay this tour.",
  },
]

const MEMBER_STEPS = [
  {
    id: 'welcome',
    target: null,
    title: 'Welcome to Chama Manager! 👋',
    body: "Quick tour of your member account. Skip anytime with ✕.",
  },
  {
    id: 'profile',
    target: '[data-tour="nav-profile"]',
    placement: 'right',
    title: 'My Profile',
    body: 'View your contribution history, share balance, loan status, and account details — all in one place.',
  },
  {
    id: 'loans',
    target: '[data-tour="nav-my-loan"]',
    placement: 'right',
    title: 'My Loan',
    body: 'Apply for a loan, view your repayment schedule, and make repayments when you\'re ready.',
  },
  {
    id: 'mgr',
    target: '[data-tour="nav-mgr"]',
    placement: 'right',
    title: 'Merry-Go-Round',
    body: 'See the payout schedule and claim your preferred slot before someone else takes it!',
  },
  {
    id: 'rules',
    target: '[data-tour="nav-rules"]',
    placement: 'right',
    title: 'Rules',
    body: "Review your group's rules, fine amounts, and expected conduct so you're always in the know.",
  },
  {
    id: 'done',
    target: null,
    title: "You're ready! 🎉",
    body: "Start by checking your profile. Tap ❓ in the bottom-right corner anytime to replay this tour.",
  },
]

// ── Context ───────────────────────────────────────────────────────────────────

const TourCtx = createContext(null)
export const useTour = () => useContext(TourCtx)

export function TourProvider({ children }) {
  const { isStaff } = useAuth()
  const steps = isStaff ? STAFF_STEPS : MEMBER_STEPS

  const [active, setActive] = useState(false)
  const [step,   setStep]   = useState(0)

  const start = useCallback(() => {
    setStep(0)
    setActive(true)
  }, [])

  const next = useCallback(() => {
    setStep(s => {
      const n = s + 1
      if (n >= steps.length) {
        setActive(false)
        localStorage.setItem(TOUR_KEY, '1')
        return s
      }
      return n
    })
  }, [steps.length])

  const prev = useCallback(() => setStep(s => Math.max(0, s - 1)), [])

  const end = useCallback(() => {
    setActive(false)
    localStorage.setItem(TOUR_KEY, '1')
  }, [])

  // Auto-start on first visit
  useEffect(() => {
    if (!localStorage.getItem(TOUR_KEY)) {
      const t = setTimeout(() => setActive(true), 1200)
      return () => clearTimeout(t)
    }
  }, [])

  return (
    <TourCtx.Provider value={{ start, end }}>
      {children}
      {active && (
        <TourOverlay
          steps={steps}
          step={step}
          onNext={next}
          onPrev={prev}
          onEnd={end}
        />
      )}
    </TourCtx.Provider>
  )
}

// ── Spotlight overlay + tooltip ───────────────────────────────────────────────

function useTargetRect(selector) {
  const [rect, setRect] = useState(null)

  useLayoutEffect(() => {
    if (!selector) { setRect(null); return }
    const el = document.querySelector(selector)
    if (!el) { setRect(null); return }
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    const r = el.getBoundingClientRect()
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
  }, [selector])

  return rect
}

function TourOverlay({ steps, step, onNext, onPrev, onEnd }) {
  const current  = steps[step]
  const isMobile = window.innerWidth < 768
  const rect     = useTargetRect((!isMobile && current.target) ? current.target : null)

  // ── Position tooltip ──────────────────────────────────────────────────────
  const TW  = 304
  const TH  = 210
  const PAD = 16
  let tooltipStyle = {}

  if (rect && !isMobile) {
    const placement = current.placement || 'right'
    let top, left

    if (placement === 'right') {
      top  = rect.top + rect.height / 2 - TH / 2
      left = rect.left + rect.width + PAD + 4
      // Flip below if tooltip overflows right
      if (left + TW > window.innerWidth - PAD) {
        top  = rect.bottom + PAD
        left = rect.left
      }
    } else if (placement === 'bottom') {
      top  = rect.bottom + PAD
      left = rect.left + rect.width / 2 - TW / 2
    } else if (placement === 'left') {
      top  = rect.top + rect.height / 2 - TH / 2
      left = rect.left - TW - PAD
    } else {
      top  = rect.top - TH - PAD
      left = rect.left + rect.width / 2 - TW / 2
    }

    // Clamp to viewport
    left = Math.max(PAD, Math.min(left, window.innerWidth  - TW - PAD))
    top  = Math.max(PAD, Math.min(top,  window.innerHeight - TH - PAD))
    tooltipStyle = { top, left }
  } else {
    tooltipStyle = { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }
  }

  const hasSpotlight = !!rect && !isMobile

  return (
    <>
      <style>{`
        @keyframes _tourFadeIn   { from{opacity:0}                            to{opacity:1} }
        @keyframes _tourSlideUp  { from{opacity:0;transform:translateY(10px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes _tourScaleIn  { from{opacity:0;transform:translate(-50%,-50%) scale(.92)} to{opacity:1;transform:translate(-50%,-50%) scale(1)} }
      `}</style>

      {/* Dark backdrop (when no spotlight) */}
      {!hasSpotlight && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9000,
          background: 'rgba(0,0,0,0.58)',
          backdropFilter: 'blur(2px)',
          animation: '_tourFadeIn .22s ease both',
        }} />
      )}

      {/* Spotlight (box-shadow trick darkens everything outside the target) */}
      {hasSpotlight && (
        <div style={{
          position: 'fixed',
          top:    rect.top    - 6,
          left:   rect.left   - 6,
          width:  rect.width  + 12,
          height: rect.height + 12,
          borderRadius: 10,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.62)',
          border: '2px solid rgba(255,255,255,0.32)',
          zIndex: 9000,
          pointerEvents: 'none',
          animation: '_tourFadeIn .25s ease both',
        }} />
      )}

      {/* Tooltip card */}
      <div style={{
        position: 'fixed',
        zIndex: 9001,
        width: TW,
        background: '#fff',
        borderRadius: 20,
        padding: '22px 22px 18px',
        boxShadow: '0 24px 64px rgba(0,0,0,.22), 0 4px 16px rgba(0,0,0,.12)',
        animation: tooltipStyle.transform
          ? '_tourScaleIn .28s cubic-bezier(.16,1,.3,1) both'
          : '_tourSlideUp  .28s cubic-bezier(.16,1,.3,1) both',
        ...tooltipStyle,
      }}>
        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {steps.map((_, i) => (
            <div key={i} style={{
              height: 3, flex: 1, borderRadius: 100,
              background: i <= step ? '#2d5a3d' : '#e5e7eb',
              transition: 'background .3s',
            }} />
          ))}
        </div>

        {/* Step counter */}
        <div style={{
          fontSize: 10, fontWeight: 700, color: '#9ca3af',
          textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6,
        }}>
          Step {step + 1} of {steps.length}
        </div>

        {/* Title */}
        <h3 style={{
          fontSize: 16, fontWeight: 800, color: '#111827',
          margin: '0 0 8px', lineHeight: 1.3,
        }}>
          {current.title}
        </h3>

        {/* Body */}
        <p style={{
          fontSize: 13, color: '#6b7280', lineHeight: 1.65,
          margin: '0 0 20px',
        }}>
          {current.body}
        </p>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {step > 0 && (
            <button
              onClick={onPrev}
              style={{
                padding: '8px 14px', borderRadius: 9,
                border: '1.5px solid #e5e7eb',
                background: '#fff', color: '#374151',
                fontWeight: 600, fontSize: 13, cursor: 'pointer',
              }}
            >← Back</button>
          )}

          <button
            onClick={onNext}
            style={{
              flex: 1, padding: '9px 16px', borderRadius: 9, border: 'none',
              background: 'linear-gradient(135deg, #2d5a3d 0%, #1e4d2b 100%)',
              color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}
          >
            {step === steps.length - 1 ? 'Done ✓' : 'Next →'}
          </button>

          <button
            onClick={onEnd}
            title="Skip tour"
            aria-label="Skip tour"
            style={{
              width: 34, height: 34, borderRadius: '50%', border: 'none',
              background: '#f3f4f6', color: '#9ca3af',
              fontSize: 15, cursor: 'pointer', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>
      </div>
    </>
  )
}

// ── Floating help button ──────────────────────────────────────────────────────

export function TourHelpButton() {
  const ctx = useTour()
  if (!ctx) return null

  return (
    <button
      onClick={ctx.start}
      title="Take a guided tour"
      aria-label="Take a guided tour"
      style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 8000,
        width: 46, height: 46, borderRadius: '50%', border: 'none',
        background: 'linear-gradient(135deg, #2d5a3d 0%, #1e4d2b 100%)',
        color: '#fff', fontSize: 20, cursor: 'pointer',
        boxShadow: '0 4px 20px rgba(45,90,61,.38), 0 2px 8px rgba(0,0,0,.14)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'transform .15s ease, box-shadow .15s ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform  = 'scale(1.12)'
        e.currentTarget.style.boxShadow = '0 6px 28px rgba(45,90,61,.5), 0 3px 12px rgba(0,0,0,.18)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform  = 'scale(1)'
        e.currentTarget.style.boxShadow = '0 4px 20px rgba(45,90,61,.38), 0 2px 8px rgba(0,0,0,.14)'
      }}
    >❓</button>
  )
}
