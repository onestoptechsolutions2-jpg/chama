import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Banknote, FileText, Smartphone } from "lucide-react";
import { getSession } from "@/lib/auth/session";

const points = [
  { icon: Banknote, title: "Record a meeting in 2 minutes", copy: "Shares, savings, welfare and loan repayments on one screen." },
  { icon: Smartphone, title: "M-Pesa recorded for you", copy: "Members pay your paybill with their number; it lands on their record." },
  { icon: FileText, title: "Everyone sees their money", copy: "An SMS receipt and a statement link after every payment." },
];

export default async function HomePage() {
  // Signed in already? Go straight to the app.
  if (await getSession()) redirect("/dashboard");

  return (
    <main className="flex min-h-dvh flex-col bg-[#f8f7f2] text-[#18332b]">
      <nav className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 sm:px-6" aria-label="Main navigation">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <span className="grid size-8 place-items-center rounded-full bg-[#e3f17b] text-sm font-black">c</span>
          chama
        </Link>
        <Link href="/login" className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-[#18332b]/5">
          Sign in
        </Link>
      </nav>

      <section className="mx-auto w-full max-w-5xl flex-1 px-4 pb-12 pt-6 sm:px-6 sm:pt-16">
        <h1 className="max-w-2xl font-serif text-4xl leading-tight tracking-tight sm:text-6xl">
          Run your chama from your phone.
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-[#18332b]/70 sm:text-lg">
          Table banking, merry-go-round, welfare and funeral groups — savings, loans and payouts in one record every member can
          trust. Free for groups of up to 10.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/register"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#18332b] px-6 py-3.5 font-semibold text-white"
          >
            Start a group <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/discover"
            className="inline-flex items-center justify-center rounded-full border border-[#18332b]/20 px-6 py-3.5 font-semibold"
          >
            Find a group to join
          </Link>
        </div>

        <ul className="mt-12 grid gap-3 sm:grid-cols-3">
          {points.map(({ icon: Icon, title, copy }) => (
            <li key={title} className="rounded-2xl border border-[#18332b]/10 bg-white/70 p-5">
              <Icon className="size-6 text-[#c75b39]" strokeWidth={1.8} />
              <p className="mt-3 font-bold">{title}</p>
              <p className="mt-1 text-sm leading-6 text-[#18332b]/65">{copy}</p>
            </li>
          ))}
        </ul>
      </section>

      <footer className="border-t border-[#18332b]/10 px-4 py-6 text-center text-xs text-[#18332b]/50 sm:px-6">
        Designed &amp; developed by Leitor Investment Company Ltd ·{" "}
        <a href="https://laitor.co.ke" target="_blank" rel="noreferrer" className="underline underline-offset-4">
          laitor.co.ke
        </a>{" "}
        · 0113352048 ·{" "}
        <a href="mailto:partnerships@laitor.co.ke" className="underline underline-offset-4">
          partnerships@laitor.co.ke
        </a>
      </footer>
    </main>
  );
}
