"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/**
 * Uploads to /api/upload on file select, then renders a hidden input named
 * `name` holding the resulting URL — so any plain <form action={serverAction}>
 * picks it up via FormData exactly like a text field, no extra plumbing in
 * the parent form. Used everywhere a KYC document/photo/signature is
 * captured (see /profile, and the Add Member form).
 */
export function FileUpload({
  name,
  label,
  defaultUrl,
  accept = "image/*",
}: {
  name: string;
  label: string;
  defaultUrl?: string | null;
  accept?: string;
}) {
  const [url, setUrl] = useState<string | null>(defaultUrl ?? null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPending(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload failed");
        return;
      }
      setUrl(data.url);
    } catch {
      setError("Network error — upload failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={`upload-${name}`}>{label}</Label>
      {url && <input type="hidden" name={name} value={url} />}
      <div className="flex items-center gap-3">
        {url && accept.startsWith("image/") && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            className="h-12 w-12 rounded-md border object-cover"
          />
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
        >
          {pending ? "Uploading…" : url ? "Replace" : "Upload"}
        </Button>
        {url && !pending && <span className="text-xs text-muted-foreground">Uploaded</span>}
      </div>
      <input
        ref={inputRef}
        id={`upload-${name}`}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleChange}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
