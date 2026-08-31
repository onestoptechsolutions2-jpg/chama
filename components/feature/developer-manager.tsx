"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { apiKeys as apiKeysTable, webhookEndpoints as webhookEndpointsTable, webhookDeliveries as webhookDeliveriesTable } from "@/lib/db/schema";
import {
  createApiKeyAction,
  revokeApiKeyAction,
  createWebhookEndpointAction,
  toggleWebhookEndpointAction,
  deleteWebhookEndpointAction,
} from "@/app/(dashboard)/dashboard/developer/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type ApiKey = typeof apiKeysTable.$inferSelect;
type WebhookEndpoint = typeof webhookEndpointsTable.$inferSelect;
type WebhookDelivery = typeof webhookDeliveriesTable.$inferSelect;

const EVENT_OPTIONS = [
  { value: "contribution.recorded", label: "Contribution recorded" },
  { value: "loan.approved", label: "Loan approved" },
  { value: "loan.rejected", label: "Loan rejected" },
  { value: "member.joined", label: "Member joined" },
  { value: "mgr.slot.paid", label: "MGR slot paid" },
] as const;

function CreateApiKeyDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [plaintext, setPlaintext] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) return;
    setPending(true);
    const result = await createApiKeyAction(null, (() => {
      const fd = new FormData();
      fd.set("name", name);
      return fd;
    })());
    setPending(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setPlaintext(result.plaintext);
  }

  function close() {
    setOpen(false);
    setName("");
    setPlaintext(null);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogTrigger render={<Button size="sm" />}>New API key</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{plaintext ? "Save this key now" : "New API key"}</DialogTitle>
        </DialogHeader>
        {plaintext ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This is shown once. Store it somewhere safe — it can&apos;t be retrieved again, only revoked and replaced.
            </p>
            <code className="block break-all rounded-md border bg-muted p-3 text-xs">{plaintext}</code>
            <Button onClick={close} className="w-full">Done</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                placeholder="e.g. Accounting sync"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button onClick={submit} disabled={pending || !name.trim()} className="w-full">
              {pending ? "Creating…" : "Create key"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ApiKeysCard({ keys }: { keys: ApiKey[] }) {
  const [revokingId, setRevokingId] = useState<number | null>(null);

  async function revoke(id: number) {
    setRevokingId(id);
    await revokeApiKeyAction(id);
    setRevokingId(null);
    toast.success("Key revoked");
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">API keys</CardTitle>
        <CreateApiKeyDialog />
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No API keys yet.
                </TableCell>
              </TableRow>
            )}
            {keys.map((key) => (
              <TableRow key={key.id}>
                <TableCell className="font-medium">{key.name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{key.keyPrefix}…</TableCell>
                <TableCell className="text-muted-foreground">
                  {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "Never"}
                </TableCell>
                <TableCell>
                  <Badge variant={key.revokedAt ? "destructive" : "secondary"}>
                    {key.revokedAt ? "Revoked" : "Active"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {!key.revokedAt && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={revokingId === key.id}
                      onClick={() => revoke(key.id)}
                    >
                      {revokingId === key.id ? "Revoking…" : "Revoke"}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CreateWebhookDialog() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleEvent(value: string) {
    setSelectedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  async function submit() {
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("url", url);
    fd.set("description", description);
    for (const event of selectedEvents) fd.append("events", event);
    const result = await createWebhookEndpointAction(null, fd);
    setPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setSecret(result.secret);
  }

  function close() {
    setOpen(false);
    setUrl("");
    setDescription("");
    setSelectedEvents(new Set());
    setSecret(null);
    setError(null);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogTrigger render={<Button size="sm" />}>New webhook endpoint</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{secret ? "Save this signing secret now" : "New webhook endpoint"}</DialogTitle>
        </DialogHeader>
        {secret ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Use this to verify the <code>X-Chama-Signature</code> header on every delivery — HMAC-SHA256 of the
              raw request body. Shown once; see docs/api.md for the verification recipe.
            </p>
            <code className="block break-all rounded-md border bg-muted p-3 text-xs">{secret}</code>
            <Button onClick={close} className="w-full">Done</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="webhook-url">URL</Label>
              <Input id="webhook-url" placeholder="https://example.com/webhooks/chama" value={url} onChange={(e) => setUrl(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="webhook-description">Description (optional)</Label>
              <Input id="webhook-description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Events</Label>
              {EVENT_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={selectedEvents.has(opt.value)}
                    onChange={() => toggleEvent(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={submit} disabled={pending || !url.trim() || selectedEvents.size === 0} className="w-full">
              {pending ? "Creating…" : "Create endpoint"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function WebhookEndpointsCard({ endpoints }: { endpoints: WebhookEndpoint[] }) {
  const [busyId, setBusyId] = useState<number | null>(null);

  async function toggle(id: number, active: boolean) {
    setBusyId(id);
    await toggleWebhookEndpointAction(id, active);
    setBusyId(null);
  }

  async function remove(id: number) {
    setBusyId(id);
    await deleteWebhookEndpointAction(id);
    setBusyId(null);
    toast.success("Endpoint removed");
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Webhook endpoints</CardTitle>
        <CreateWebhookDialog />
      </CardHeader>
      <CardContent className="space-y-3">
        {endpoints.length === 0 && <p className="text-sm text-muted-foreground">No webhook endpoints yet.</p>}
        {endpoints.map((endpoint) => (
          <div key={endpoint.id} className="space-y-2 rounded-md border p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="break-all font-medium">{endpoint.url}</span>
              <Badge variant={endpoint.active ? "secondary" : "outline"}>
                {endpoint.active ? "Active" : "Paused"}
              </Badge>
            </div>
            {endpoint.description && <p className="text-muted-foreground">{endpoint.description}</p>}
            <div className="flex flex-wrap gap-1.5">
              {endpoint.events.map((event) => (
                <Badge key={event} variant="outline" className="font-normal">
                  {event}
                </Badge>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                disabled={busyId === endpoint.id}
                onClick={() => toggle(endpoint.id, !endpoint.active)}
              >
                {endpoint.active ? "Pause" : "Resume"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busyId === endpoint.id}
                onClick={() => remove(endpoint.id)}
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RecentDeliveriesCard({ deliveries }: { deliveries: WebhookDelivery[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent deliveries</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Attempted</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deliveries.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No deliveries yet.
                </TableCell>
              </TableRow>
            )}
            {deliveries.map((delivery) => (
              <TableRow key={delivery.id}>
                <TableCell className="text-muted-foreground">
                  {new Date(delivery.attemptedAt).toLocaleString()}
                </TableCell>
                <TableCell className="capitalize">{delivery.eventType}</TableCell>
                <TableCell>
                  <Badge variant={delivery.success ? "secondary" : "destructive"}>
                    {delivery.success ? `${delivery.responseStatus ?? "OK"}` : delivery.errorMessage ?? "Failed"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function DeveloperManager({
  keys,
  endpoints,
  recentDeliveries,
}: {
  keys: ApiKey[];
  endpoints: WebhookEndpoint[];
  recentDeliveries: WebhookDelivery[];
}) {
  return (
    <div className="space-y-6">
      <ApiKeysCard keys={keys} />
      <WebhookEndpointsCard endpoints={endpoints} />
      <RecentDeliveriesCard deliveries={recentDeliveries} />
    </div>
  );
}
