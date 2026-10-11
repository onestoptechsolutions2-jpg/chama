import { buttonVariants } from "@/components/ui/button";

/** "Continue with Google" — a plain link into /api/auth/google, which does the redirect dance. */
export function GoogleButton({ next }: { next: string | null }) {
  const href = next ? `/api/auth/google?next=${encodeURIComponent(next)}` : "/api/auth/google";
  return (
    <div className="mb-4">
      <a href={href} className={`${buttonVariants({ variant: "outline" })} w-full`}>
        Continue with Google
      </a>
      <p className="mt-4 text-center text-xs text-muted-foreground">or use your email or phone</p>
    </div>
  );
}
