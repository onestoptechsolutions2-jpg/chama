"use client";

import { useState } from "react";
import { toast } from "sonner";
import type {
  groupDocuments as groupDocumentsTable,
  complianceObligations as complianceObligationsTable,
} from "@/lib/db/schema";
import {
  uploadGroupDocumentAction,
  deleteGroupDocumentAction,
  createComplianceObligationAction,
  markObligationCompleteAction,
  deleteComplianceObligationAction,
} from "@/app/(dashboard)/dashboard/governance/actions";
import { FileUpload } from "@/components/feature/file-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type GroupDocument = typeof groupDocumentsTable.$inferSelect;
type ComplianceObligation = typeof complianceObligationsTable.$inferSelect;

const DOCUMENT_CATEGORIES = [
  { value: "constitution", label: "Constitution" },
  { value: "bank_details", label: "Bank details" },
  { value: "registration_certificate", label: "Registration certificate" },
  { value: "minutes", label: "Minutes" },
  { value: "other", label: "Other" },
];

const OBLIGATION_TYPES = [
  { value: "agm", label: "AGM" },
  { value: "annual_returns", label: "Annual returns" },
  { value: "custom", label: "Custom" },
];

function UploadDocumentDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("other");
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setTitle("");
    setCategory("other");
    setFileUrl(null);
    setError(null);
  }

  async function submit() {
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("title", title);
    fd.set("category", category);
    fd.set("fileUrl", fileUrl ?? "");
    const result = await uploadGroupDocumentAction(null, fd);
    setPending(false);
    if (result && "error" in result) {
      setError(result.error);
      return;
    }
    toast.success("Document added");
    close();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogTrigger render={<Button size="sm" />}>Add document</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add document</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="doc-title">Title</Label>
            <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Group constitution" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="doc-category">Category</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v ?? "other")}
              items={Object.fromEntries(DOCUMENT_CATEGORIES.map((c) => [c.value, c.label]))}
            >
              <SelectTrigger id="doc-category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <FileUpload
            name="fileUrl"
            label="File (PDF or image)"
            accept="application/pdf,image/*"
            folder="governance"
            onUploaded={setFileUrl}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={submit} disabled={pending || !title.trim() || !fileUrl} className="w-full">
            {pending ? "Saving…" : "Add document"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DocumentsCard({ documents }: { documents: GroupDocument[] }) {
  const [busyId, setBusyId] = useState<number | null>(null);

  async function remove(id: number) {
    setBusyId(id);
    await deleteGroupDocumentAction(id);
    setBusyId(null);
    toast.success("Document removed");
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Documents</CardTitle>
        <UploadDocumentDialog />
      </CardHeader>
      <CardContent className="space-y-2">
        {documents.length === 0 && <p className="text-sm text-muted-foreground">No documents yet.</p>}
        {documents.map((doc) => (
          <div key={doc.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
            <div>
              <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="font-medium underline">
                {doc.title}
              </a>
              <p className="text-muted-foreground capitalize">{doc.category.replace(/_/g, " ")}</p>
            </div>
            <Button size="sm" variant="outline" disabled={busyId === doc.id} onClick={() => remove(doc.id)}>
              Delete
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AddObligationDialog() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("custom");
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [recurrenceMonths, setRecurrenceMonths] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setType("custom");
    setTitle("");
    setDueDate("");
    setRecurrenceMonths("");
    setNotes("");
    setError(null);
  }

  async function submit() {
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("type", type);
    fd.set("title", title);
    fd.set("dueDate", dueDate);
    if (recurrenceMonths) fd.set("recurrenceMonths", recurrenceMonths);
    fd.set("notes", notes);
    const result = await createComplianceObligationAction(null, fd);
    setPending(false);
    if (result && "error" in result) {
      setError(result.error);
      return;
    }
    toast.success("Obligation added");
    close();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogTrigger render={<Button size="sm" />}>Add obligation</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add compliance obligation</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ob-type">Type</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v ?? "custom")}
              items={Object.fromEntries(OBLIGATION_TYPES.map((t) => [t.value, t.label]))}
            >
              <SelectTrigger id="ob-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OBLIGATION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ob-title">Title</Label>
            <Input id="ob-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 2026 AGM" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ob-due">Due date</Label>
            <Input id="ob-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ob-recurrence">Repeats every (months, optional)</Label>
            <Input
              id="ob-recurrence"
              type="number"
              min="1"
              placeholder="e.g. 12 for annual"
              value={recurrenceMonths}
              onChange={(e) => setRecurrenceMonths(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ob-notes">Notes (optional)</Label>
            <Textarea id="ob-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={submit} disabled={pending || !title.trim() || !dueDate} className="w-full">
            {pending ? "Saving…" : "Add obligation"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function statusVariant(status: ComplianceObligation["status"]): "secondary" | "destructive" | "outline" {
  if (status === "overdue") return "destructive";
  if (status === "completed") return "outline";
  return "secondary";
}

function ObligationsCard({ obligations }: { obligations: ComplianceObligation[] }) {
  const [busyId, setBusyId] = useState<number | null>(null);

  async function complete(id: number) {
    setBusyId(id);
    await markObligationCompleteAction(id);
    setBusyId(null);
    toast.success("Marked complete");
  }

  async function remove(id: number) {
    setBusyId(id);
    await deleteComplianceObligationAction(id);
    setBusyId(null);
    toast.success("Obligation removed");
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Compliance obligations</CardTitle>
        <AddObligationDialog />
      </CardHeader>
      <CardContent className="space-y-2">
        {obligations.length === 0 && <p className="text-sm text-muted-foreground">No obligations yet.</p>}
        {obligations.map((ob) => (
          <div key={ob.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
            <div>
              <p className="font-medium">{ob.title}</p>
              <p className="text-muted-foreground">
                Due {ob.dueDate}
                {ob.recurrenceMonths ? ` · repeats every ${ob.recurrenceMonths}mo` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={statusVariant(ob.status)} className="capitalize">
                {ob.status}
              </Badge>
              {ob.status !== "completed" && (
                <Button size="sm" variant="outline" disabled={busyId === ob.id} onClick={() => complete(ob.id)}>
                  Mark complete
                </Button>
              )}
              <Button size="sm" variant="outline" disabled={busyId === ob.id} onClick={() => remove(ob.id)}>
                Delete
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function GovernanceManager({
  documents,
  obligations,
}: {
  documents: GroupDocument[];
  obligations: ComplianceObligation[];
}) {
  return (
    <div className="space-y-6">
      <DocumentsCard documents={documents} />
      <ObligationsCard obligations={obligations} />
    </div>
  );
}
