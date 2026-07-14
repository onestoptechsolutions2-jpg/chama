"use client";

import { useActionState, useState, useTransition } from "react";
import type { projects as projectsTable, members as membersTable } from "@/lib/db/schema";
import { projectStatuses } from "@/lib/validation/projects";
import {
  createProjectAction,
  addProjectContributionAction,
  updateProjectStatusAction,
  type ProjectActionState,
} from "@/app/(dashboard)/projects/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Project = typeof projectsTable.$inferSelect;
type Member = typeof membersTable.$inferSelect;

function ksh(n: string | number) {
  return `Ksh ${Number(n).toLocaleString()}`;
}

const statusVariant = {
  planning: "secondary",
  active: "default",
  on_hold: "secondary",
  completed: "outline",
  cancelled: "destructive",
} as const;

function CreateProjectForm() {
  const [state, formAction, pending] = useActionState<ProjectActionState, FormData>(
    createProjectAction,
    null,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Start a project</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="targetAmount">Target amount (Ksh)</Label>
              <Input id="targetAmount" name="targetAmount" type="number" min="0" step="1" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" />
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create project"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ContributeDialog({ project, members }: { project: Project; members: Member[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ProjectActionState, FormData>(
    async (prev, formData) => {
      const result = await addProjectContributionAction(project.id, prev, formData);
      if (!result) setOpen(false);
      return result;
    },
    null,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Add contribution</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add contribution — {project.name}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`member-${project.id}`}>Member</Label>
            <Select
              name="memberId"
              required
              items={Object.fromEntries(members.map((m) => [String(m.id), m.name]))}
            >
              <SelectTrigger id={`member-${project.id}`} className="w-full">
                <SelectValue placeholder="Select member" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`amount-${project.id}`}>Amount (Ksh)</Label>
            <Input id={`amount-${project.id}`} name="amount" type="number" min="1" step="1" required />
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Adding…" : "Add contribution"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StatusSelect({ project }: { project: Project }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Select
      value={project.status}
      onValueChange={(v) => v && startTransition(() => updateProjectStatusAction(project.id, v as Project["status"]))}
      items={Object.fromEntries(projectStatuses.map((s) => [s, s.replace("_", " ")]))}
    >
      <SelectTrigger className="w-36" disabled={isPending}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {projectStatuses.map((s) => (
          <SelectItem key={s} value={s} className="capitalize">
            {s.replace("_", " ")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ProjectCard({
  project,
  members,
  canEdit,
}: {
  project: Project;
  members: Member[];
  canEdit: boolean;
}) {
  const target = Number(project.targetAmount);
  const collected = Number(project.collectedAmount);
  const pct = target > 0 ? Math.min(100, Math.round((collected / target) * 100)) : 0;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">{project.name}</CardTitle>
          {project.description && (
            <p className="text-sm text-muted-foreground">{project.description}</p>
          )}
        </div>
        <Badge variant={statusVariant[project.status]} className="capitalize">
          {project.status.replace("_", " ")}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span>{ksh(collected)} raised</span>
            {target > 0 && <span className="text-muted-foreground">of {ksh(target)}</span>}
          </div>
          {target > 0 && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <ContributeDialog project={project} members={members} />
            <StatusSelect project={project} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ProjectsManager({
  projects,
  members,
  canEdit,
}: {
  projects: Project[];
  members: Member[];
  canEdit: boolean;
}) {
  return (
    <div className="space-y-6">
      {canEdit && <CreateProjectForm />}

      {projects.length === 0 && (
        <p className="text-sm text-muted-foreground">No projects yet.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} members={members} canEdit={canEdit} />
        ))}
      </div>
    </div>
  );
}
