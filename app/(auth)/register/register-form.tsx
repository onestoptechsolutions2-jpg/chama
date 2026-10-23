"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { registerAction, type AuthActionState } from "../actions";
import { Button } from "@/components/ui/button";
import { GoogleButton } from "@/components/feature/google-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function RegisterView({ googleEnabled }: { googleEnabled: boolean }) {
  return (
    <Suspense>
      <RegisterForm googleEnabled={googleEnabled} />
    </Suspense>
  );
}

function RegisterForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(
    registerAction,
    null,
  );
  const params = useSearchParams();
  const next = params.get("next");
  const googleFailed = params.get("error") === "google";

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Create account</CardTitle>
        </CardHeader>
        <CardContent>
          {googleEnabled && <GoogleButton next={next} />}
          {googleFailed && (
            <p className="mb-4 text-sm text-destructive">
              Google sign-in did not work. Please try again.
            </p>
          )}
          <form action={formAction} className="space-y-4">
            {next && <input type="hidden" name="next" value={next} />}
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" name="name" autoComplete="name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                placeholder="0712 345 678"
                autoComplete="tel"
              />
              <p className="text-xs text-muted-foreground">Your phone is your account. Use the number your group knows.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email (optional)</Label>
              <Input id="email" name="email" type="email" autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
              />
            </div>
            {state?.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Creating account…" : "Create account"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
              className="underline underline-offset-4"
            >
              Sign in
            </Link>
          </p>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            <Link href="/discover" className="underline underline-offset-4">
              Discover public groups
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
