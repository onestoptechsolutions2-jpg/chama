import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  Eye,
  Landmark,
  MessageSquareWarning,
  Scale,
  Smartphone,
  Sparkles,
  ShieldCheck,
  Zap,
} from "lucide-react";

const problems = [
  {
    icon: Smartphone,
    title: "The books live in one notebook, or one phone.",
    copy: "One person holds the record — a phone note, an exercise book — and everyone else takes their word for it.",
  },
  {
    icon: Scale,
    title: "Trust breaks down when no one can check the math.",
    copy: "When savings, loans, and payouts can't be verified independently, a disagreement turns into a group falling apart.",
  },
  {
    icon: MessageSquareWarning,
    title: "Reminders get buried in WhatsApp.",
    copy: "Dues, meeting dates, and fines are scattered across chat threads nobody can search once a dispute comes up.",
  },
  {
    icon: BarChart3,
    title: "Big decisions run on guesswork.",
    copy: "Loan limits, welfare caps, and payout schedules get set from memory, not from what the group can actually afford.",
  },
];

const solutions = [
  {
    icon: Eye,
    dimension: "See it",
    title: "One shared record, visible to everyone.",
    copy: "Contributions, fines, loans, and welfare — updated the moment something happens, not at month-end.",
  },
  {
    icon: Zap,
    dimension: "Automate it",
    title: "Dues and penalties enforce themselves.",
    copy: "Contribution reminders and late fines happen on their own — nobody has to chase anybody.",
  },
  {
    icon: ShieldCheck,
    dimension: "Trust it",
    title: "Every action is accountable.",
    copy: "Who approved what, and when, is always on record — no single person's word is the final say.",
  },
  {
    icon: Sparkles,
    dimension: "Grow with it",
    title: "Room to grow with your group.",
    copy: "Loans, a welfare fund, merry-go-round payouts, group projects — turn on what you need, when you're ready.",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f8f7f2] text-[#18332b]">
      <section className="relative border-b border-[#18332b]/10">
        <div className="mx-auto max-w-7xl px-5 pb-16 pt-5 sm:px-8 lg:px-12 lg:pb-24">
          <nav className="flex items-center justify-between" aria-label="Main navigation">
            <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-[-0.03em]">
              <span className="grid size-8 place-items-center rounded-full bg-[#e3f17b] text-sm font-black text-[#18332b]">c</span>
              chama
            </Link>
            <div className="flex items-center gap-3 text-sm font-semibold">
              <div className="hidden items-center gap-1 md:flex">
                <a href="#problem" className="px-3 py-2 text-[#18332b]/70 transition-colors hover:text-[#18332b]">The problem</a>
                <a href="#solution" className="px-3 py-2 text-[#18332b]/70 transition-colors hover:text-[#18332b]">The solution</a>
                <Link href="/discover" className="px-3 py-2 text-[#18332b]/70 transition-colors hover:text-[#18332b]">Find a group</Link>
              </div>
              <Link href="/login" className="rounded-full px-3 py-2 text-[#18332b]/70 transition-colors hover:text-[#18332b]">
                Sign in
              </Link>
              <Link href="/register" className="rounded-full bg-[#18332b] px-4 py-2.5 text-[#f8f7f2] transition-transform hover:-translate-y-0.5">
                Get started
              </Link>
            </div>
          </nav>

          <div className="grid items-center gap-14 pt-16 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20 lg:pt-24">
            <div className="max-w-xl animate-[rise-in_700ms_ease-out_both]">
              <p className="mb-5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#c75b39]">
                <span className="h-px w-8 bg-[#c75b39]" />
                Group money, made human
              </p>
              <h1 className="max-w-lg font-serif text-5xl leading-[0.98] tracking-[-0.055em] sm:text-7xl">
                Grow together. <span className="text-[#c75b39]">Keep it clear.</span>
              </h1>
              <p className="mt-7 max-w-md text-lg leading-8 text-[#18332b]/68">
                Your chama&apos;s money shouldn&apos;t live in one person&apos;s notebook. Chama gives it one trusted, shared home instead.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-4">
                <Link href="/register" className="group inline-flex items-center gap-3 rounded-full bg-[#c75b39] px-6 py-3.5 font-semibold text-white shadow-[0_12px_24px_-12px_#c75b39] transition-transform hover:-translate-y-1">
                  Start your chama
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link href="/discover" className="inline-flex items-center gap-2 px-2 py-3.5 font-semibold text-[#18332b] underline decoration-[#18332b]/25 underline-offset-8 transition-colors hover:decoration-[#c75b39]">
                  Explore public groups
                  <ArrowUpRight className="size-4" />
                </Link>
              </div>
              <div className="mt-10 flex items-center gap-3 text-sm text-[#18332b]/60">
                <span className="flex -space-x-2">
                  <span className="grid size-8 place-items-center rounded-full border-2 border-[#f8f7f2] bg-[#e3f17b] text-xs font-bold">A</span>
                  <span className="grid size-8 place-items-center rounded-full border-2 border-[#f8f7f2] bg-[#e6c7ae] text-xs font-bold">M</span>
                  <span className="grid size-8 place-items-center rounded-full border-2 border-[#f8f7f2] bg-[#a6c7be] text-xs font-bold">K</span>
                </span>
                <span>Made for groups that move together.</span>
              </div>
            </div>

            <div className="relative animate-[rise-in_800ms_150ms_ease-out_both] lg:pl-8">
              <div className="absolute -right-3 -top-8 hidden rotate-6 rounded-full bg-[#e3f17b] px-5 py-3 text-sm font-bold shadow-sm sm:block">Your money, in motion ↗</div>
              <div className="relative rounded-[2rem] bg-[#18332b] p-3 shadow-[0_30px_70px_-28px_#18332b] sm:p-5">
                <div className="rounded-[1.4rem] bg-[#f5f0e6] p-5 sm:p-7">
                  <div className="flex items-start justify-between border-b border-[#18332b]/10 pb-6">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#18332b]/45">Good morning, Amina</p>
                      <h2 className="mt-2 font-serif text-2xl tracking-tight">Kilimani Circle</h2>
                    </div>
                    <span className="grid size-10 place-items-center rounded-full bg-[#c75b39] text-sm font-bold text-white">AK</span>
                  </div>
                  <div className="grid gap-3 py-6 sm:grid-cols-2">
                    <div className="rounded-2xl bg-[#e3f17b] p-5">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#18332b]/55">Your savings</p>
                      <p className="mt-3 text-3xl font-bold tracking-[-0.05em]">KES 84,500</p>
                      <p className="mt-2 text-xs font-semibold text-[#18332b]/60">+ KES 5,000 this month</p>
                    </div>
                    <div className="rounded-2xl bg-white p-5">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#18332b]/55">Group capital</p>
                      <p className="mt-3 text-3xl font-bold tracking-[-0.05em]">KES 1.2m</p>
                      <p className="mt-2 text-xs font-semibold text-[#18332b]/60">18 active members</p>
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white p-5">
                    <div className="mb-5 flex items-center justify-between">
                      <p className="font-semibold">Recent activity</p>
                      <span className="text-xs font-bold text-[#c75b39]">View all</span>
                    </div>
                    <div className="space-y-4 text-sm">
                      <div className="flex items-center justify-between"><span className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-[#e9f2ee]"><Check className="size-4 text-[#3b7d63]" /></span><span><strong className="block">Monthly contribution</strong><span className="text-xs text-[#18332b]/45">Today, 09:41</span></span></span><strong>+ KES 5,000</strong></div>
                      <div className="flex items-center justify-between"><span className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-[#f7e3dc]"><Landmark className="size-4 text-[#c75b39]" /></span><span><strong className="block">Loan repayment</strong><span className="text-xs text-[#18332b]/45">Yesterday</span></span></span><strong>+ KES 2,500</strong></div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-6 -left-4 hidden rounded-2xl border border-[#18332b]/10 bg-white px-4 py-3 shadow-lg sm:flex sm:items-center sm:gap-3">
                <ShieldCheck className="size-5 text-[#3b7d63]" />
                <span className="text-xs font-bold">Every action accounted for</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="problem" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
        <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:gap-24">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#c75b39]">The problem</p>
            <h2 className="mt-4 max-w-sm font-serif text-4xl leading-tight tracking-[-0.04em] sm:text-5xl">Running a chama by hand doesn&apos;t scale.</h2>
            <p className="mt-6 max-w-sm text-sm leading-6 text-[#18332b]/60">Every group hits the same wall eventually — usually right when the money starts to matter most.</p>
          </div>
          <div className="grid gap-10 sm:grid-cols-2">
            {problems.map(({ icon: Icon, title, copy }) => (
              <article key={title} className="group border-t border-[#18332b]/15 pt-5">
                <Icon className="size-6 text-[#c75b39] transition-transform group-hover:-translate-y-1" strokeWidth={1.7} />
                <h3 className="mt-6 text-xl font-bold leading-tight tracking-[-0.03em]">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#18332b]/60">{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="solution" className="border-y border-[#18332b]/10 bg-[#e9f0e9] px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#c75b39]">The solution</p>
              <h2 className="mt-4 max-w-lg font-serif text-4xl leading-tight tracking-[-0.04em] sm:text-5xl">Four things a chama actually needs.</h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-[#18332b]/60">Not a spreadsheet with extra steps — a system built around how savings groups really run.</p>
          </div>
          <div className="mt-14 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {solutions.map(({ icon: Icon, dimension, title, copy }) => (
              <article key={dimension} className="relative border-t border-[#18332b]/20 pt-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-[#c75b39]">{dimension}</span>
                  <Icon className="size-6 text-[#18332b]/60" strokeWidth={1.6} />
                </div>
                <h3 className="mt-10 text-xl font-bold leading-tight tracking-[-0.035em]">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#18332b]/60">{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-20 sm:px-8 lg:px-12 lg:pb-28">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 rounded-[2rem] bg-[#c75b39] px-7 py-10 text-white sm:px-12 sm:py-14 lg:flex-row lg:items-center">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-white/65">Your next chapter</p><h2 className="mt-3 max-w-xl font-serif text-4xl leading-tight tracking-[-0.04em] sm:text-5xl">Make the group easier to run.</h2></div>
          <Link href="/register" className="group inline-flex shrink-0 items-center gap-3 rounded-full bg-[#f8f7f2] px-6 py-3.5 font-semibold text-[#18332b] transition-transform hover:-translate-y-1">Create your group <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></Link>
        </div>
      </section>

      <footer className="border-t border-[#18332b]/10 px-5 py-8 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-sm text-[#18332b]/55 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-bold text-[#18332b]">chama</span>
          <span>Built for the way groups grow.</span>
          <div className="flex gap-5 font-semibold"><Link href="/discover" className="hover:text-[#18332b]">Discover</Link><Link href="/login" className="hover:text-[#18332b]">Sign in</Link></div>
        </div>
      </footer>
    </main>
  );
}
