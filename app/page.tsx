import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  HeartHandshake,
  Landmark,
  ShieldCheck,
  UsersRound,
  WalletCards,
} from "lucide-react";

const features = [
  {
    icon: UsersRound,
    eyebrow: "One shared record",
    title: "Bring the whole group into focus.",
    copy: "Keep members, meetings, rules, and decisions in one calm, reliable place.",
  },
  {
    icon: WalletCards,
    eyebrow: "Clear money trails",
    title: "Know where every shilling stands.",
    copy: "Track contributions, fines, loans, welfare, and capital without spreadsheet archaeology.",
  },
  {
    icon: HeartHandshake,
    eyebrow: "Built for real life",
    title: "Make room for the moments that matter.",
    copy: "Support welfare claims, rotating payouts, and group projects with less admin overhead.",
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
              <Link href="/discover" className="hidden px-3 py-2 text-[#18332b]/70 transition-colors hover:text-[#18332b] sm:block">
                Find a group
              </Link>
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
                Chama gives your savings group one trusted home for contributions, loans, welfare, and the decisions that move you forward.
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

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
        <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:gap-24">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#c75b39]">Less admin. More progress.</p>
            <h2 className="mt-4 max-w-sm font-serif text-4xl leading-tight tracking-[-0.04em] sm:text-5xl">The group stays in the room.</h2>
          </div>
          <div className="grid gap-10 sm:grid-cols-3">
            {features.map(({ icon: Icon, eyebrow, title, copy }) => (
              <article key={title} className="group border-t border-[#18332b]/15 pt-5">
                <Icon className="size-6 text-[#c75b39] transition-transform group-hover:-translate-y-1" strokeWidth={1.7} />
                <p className="mt-6 text-xs font-bold uppercase tracking-[0.12em] text-[#18332b]/45">{eyebrow}</p>
                <h3 className="mt-3 text-xl font-bold leading-tight tracking-[-0.03em]">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#18332b]/60">{copy}</p>
              </article>
            ))}
          </div>
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
