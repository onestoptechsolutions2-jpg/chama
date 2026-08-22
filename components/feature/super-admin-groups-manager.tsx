"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { groups as groupsTable } from "@/lib/db/schema";
import { groupTypes } from "@/lib/validation/groups";
import { visibleRuleTemplates, type RuleTemplate } from "@/lib/domain/rule-templates";
import {
  createGroupAction,
  setGroupActiveAction,
  updateGroupAccountAction,
  updateGroupAction,
  type CreateGroupState,
} from "@/app/super-admin/groups/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

type Group = typeof groupsTable.$inferSelect;
type PlatformUser = { id: number; name: string; email: string | null };
type AccountActivity = {
  id: number;
  groupId: number;
  activityType: string;
  note: string;
  nextFollowUpAt: Date | null;
  createdAt: Date;
};
type GroupFinance = {
  pendingAmount: string;
  pendingCount: number;
  latestStatus: string;
  latestAmount: string;
  paidAmount: string;
  pendingPaymentAmount: string;
};

const VEHICLE_OPTIONS = [
  {
    key: "loans" as const,
    label: "Table Banking",
    description: "Loan applications, guarantors, approvals, and repayments.",
  },
  {
    key: "mgr" as const,
    label: "Merry-Go-Round",
    description: "Rotation cycles, turns, and payouts.",
  },
  {
    key: "welfare" as const,
    label: "Welfare",
    description: "Welfare claims and the welfare fund.",
  },
  {
    key: "projects" as const,
    label: "Investment",
    description: "Table-banking style projects and contributions.",
  },
];

type VehicleKey = (typeof VEHICLE_OPTIONS)[number]["key"];

const DEFAULT_LOAN_SETTINGS = {
  loanInterestRate: "20",
  loanMaxMultiplier: "3",
  loanRepaymentMonths: "6",
  loanLatePenalty: "500",
  loanMinGuarantors: "1",
};

type Basics = {
  name: string;
  type: string;
  description: string;
  isPublic: string;
  requireApproval: string;
  maxMembers: string;
  adminEmail: string;
};

const DEFAULT_BASICS: Basics = {
  name: "",
  type: "chama",
  description: "",
  isPublic: "true",
  requireApproval: "true",
  maxMembers: "",
  adminEmail: "",
};

const DEFAULT_VEHICLES: Record<VehicleKey, boolean> = {
  loans: false,
  mgr: false,
  welfare: false,
  projects: false,
};

/**
 * Runs the same steps the vehicle-activation wizard (Settings > Products)
 * runs one vehicle at a time, but once, at group birth — basics, pick
 * vehicles, configure them, starter rules, review. Same reasoning as that
 * wizard: the founding admin should land with the group already
 * configured, not have to separately discover Settings' six tabs to finish
 * setting it up. One combined server action fires only at the final step —
 * see createGroupAction in app/super-admin/groups/actions.ts.
 */
function CreateGroupWizard() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [basics, setBasics] = useState<Basics>(DEFAULT_BASICS);
  const [vehicles, setVehicles] = useState<Record<VehicleKey, boolean>>(DEFAULT_VEHICLES);
  const [loanSettings, setLoanSettings] = useState(DEFAULT_LOAN_SETTINGS);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasConfigStep = vehicles.loans;
  const templates = useMemo(() => visibleRuleTemplates(vehicles), [vehicles]);
  const templatesByCategory = useMemo(() => {
    const map = new Map<string, RuleTemplate[]>();
    for (const t of templates) {
      const list = map.get(t.category) ?? [];
      list.push(t);
      map.set(t.category, list);
    }
    return map;
  }, [templates]);

  const stepTitles = hasConfigStep
    ? ["Basics", "Vehicles", "Set loan terms", "Starter rules", "Review"]
    : ["Basics", "Vehicles", "Starter rules", "Review"];
  const lastStep = stepTitles.length - 1;
  const rulesStepIndex = hasConfigStep ? 3 : 2;
  const isBasicsStep = step === 0;
  const isVehiclesStep = step === 1;
  const isConfigStep = hasConfigStep && step === 2;
  const isRulesStep = step === rulesStepIndex;
  const isReviewStep = step === lastStep;

  function reset() {
    setStep(0);
    setBasics(DEFAULT_BASICS);
    setVehicles(DEFAULT_VEHICLES);
    setLoanSettings(DEFAULT_LOAN_SETTINGS);
    setSelectedTemplateIds(new Set());
    setError(null);
  }

  function toggleTemplate(id: string) {
    setSelectedTemplateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const basicsValid = basics.name.trim().length > 0 && /\S+@\S+\.\S+/.test(basics.adminEmail);

  async function finish() {
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("name", basics.name);
    fd.set("type", basics.type);
    fd.set("description", basics.description);
    fd.set("isPublic", basics.isPublic);
    fd.set("requireApproval", basics.requireApproval);
    if (basics.maxMembers) fd.set("maxMembers", basics.maxMembers);
    fd.set("adminEmail", basics.adminEmail);
    if (vehicles.loans) fd.set("loansEnabled", "on");
    if (vehicles.mgr) fd.set("mgrEnabled", "on");
    if (vehicles.welfare) fd.set("welfareEnabled", "on");
    if (vehicles.projects) fd.set("projectsEnabled", "on");
    if (hasConfigStep) {
      fd.set("loanInterestRate", loanSettings.loanInterestRate);
      fd.set("loanMaxMultiplier", loanSettings.loanMaxMultiplier);
      fd.set("loanRepaymentMonths", loanSettings.loanRepaymentMonths);
      fd.set("loanLatePenalty", loanSettings.loanLatePenalty);
      fd.set("loanMinGuarantors", loanSettings.loanMinGuarantors);
    }
    for (const id of selectedTemplateIds) fd.append("templateIds", id);

    const result: CreateGroupState = await createGroupAction(null, fd);
    setPending(false);
    if (result && "error" in result) {
      setError(result.error);
      return;
    }
    toast.success(`${basics.name} created`);
    setOpen(false);
    reset();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button />}>New group</DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a new group</DialogTitle>
        </DialogHeader>

        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Step {step + 1} of {stepTitles.length} — {stepTitles[step]}
        </p>

        {isBasicsStep && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wizard-name">Name</Label>
              <Input
                id="wizard-name"
                value={basics.name}
                onChange={(e) => setBasics((s) => ({ ...s, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wizard-type">Type</Label>
              <Select
                name="type"
                value={basics.type}
                onValueChange={(v) => setBasics((s) => ({ ...s, type: v ?? "chama" }))}
                items={Object.fromEntries(groupTypes.map((t) => [t, t]))}
              >
                <SelectTrigger id="wizard-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {groupTypes.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wizard-description">Description</Label>
              <Input
                id="wizard-description"
                value={basics.description}
                onChange={(e) => setBasics((s) => ({ ...s, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="wizard-visibility">Visibility</Label>
                <Select
                  name="isPublic"
                  value={basics.isPublic}
                  onValueChange={(v) => setBasics((s) => ({ ...s, isPublic: v ?? "true" }))}
                  items={{ true: "Public", false: "Private" }}
                >
                  <SelectTrigger id="wizard-visibility" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Public</SelectItem>
                    <SelectItem value="false">Private</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wizard-joining">Joining</Label>
                <Select
                  name="requireApproval"
                  value={basics.requireApproval}
                  onValueChange={(v) => setBasics((s) => ({ ...s, requireApproval: v ?? "true" }))}
                  items={{ true: "Requires approval", false: "Auto-approve" }}
                >
                  <SelectTrigger id="wizard-joining" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Requires approval</SelectItem>
                    <SelectItem value="false">Auto-approve</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wizard-maxmembers">Max members (optional)</Label>
              <Input
                id="wizard-maxmembers"
                type="number"
                min="1"
                step="1"
                value={basics.maxMembers}
                onChange={(e) => setBasics((s) => ({ ...s, maxMembers: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wizard-adminemail">Initial admin&apos;s email</Label>
              <Input
                id="wizard-adminemail"
                type="email"
                value={basics.adminEmail}
                onChange={(e) => setBasics((s) => ({ ...s, adminEmail: e.target.value }))}
                required
              />
              <p className="text-xs text-muted-foreground">
                Must belong to an existing account — they&apos;ll become this group&apos;s admin.
              </p>
            </div>
          </div>
        )}

        {isVehiclesStep && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Which financial vehicles does this group want to run? Every group always has the
              base savings/contributions ledger — these are additional ones, and can be
              activated later from Settings too.
            </p>
            {VEHICLE_OPTIONS.map((v) => (
              <label key={v.key} className="flex items-start gap-3 rounded-md border p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4"
                  checked={vehicles[v.key]}
                  onChange={(e) => setVehicles((s) => ({ ...s, [v.key]: e.target.checked }))}
                />
                <span>
                  <span className="block font-medium">{v.label}</span>
                  <span className="block text-muted-foreground">{v.description}</span>
                </span>
              </label>
            ))}
          </div>
        )}

        {isConfigStep && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              What every loan in this group is computed against — the admin can change these
              again later in Settings.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="wizard-interest">Interest rate (%)</Label>
                <Input
                  id="wizard-interest"
                  type="number"
                  min="0"
                  step="0.1"
                  value={loanSettings.loanInterestRate}
                  onChange={(e) =>
                    setLoanSettings((s) => ({ ...s, loanInterestRate: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wizard-multiplier">Loan limit (× total savings)</Label>
                <Input
                  id="wizard-multiplier"
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={loanSettings.loanMaxMultiplier}
                  onChange={(e) =>
                    setLoanSettings((s) => ({ ...s, loanMaxMultiplier: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wizard-months">Repayment period (months)</Label>
                <Input
                  id="wizard-months"
                  type="number"
                  min="1"
                  step="1"
                  value={loanSettings.loanRepaymentMonths}
                  onChange={(e) =>
                    setLoanSettings((s) => ({ ...s, loanRepaymentMonths: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wizard-penalty">Late penalty (Ksh)</Label>
                <Input
                  id="wizard-penalty"
                  type="number"
                  min="0"
                  step="1"
                  value={loanSettings.loanLatePenalty}
                  onChange={(e) =>
                    setLoanSettings((s) => ({ ...s, loanLatePenalty: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="wizard-guarantors">Required guarantors</Label>
                <Input
                  id="wizard-guarantors"
                  type="number"
                  min="0"
                  max="10"
                  step="1"
                  value={loanSettings.loanMinGuarantors}
                  onChange={(e) =>
                    setLoanSettings((s) => ({ ...s, loanMinGuarantors: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  How many must accept before a member&apos;s loan application can be approved.
                  0 means guarantors aren&apos;t required.
                </p>
              </div>
            </div>
          </div>
        )}

        {isRulesStep && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Optional — pick any starter rules to add as-is. The founding admin can edit or add
              more later from the Rules page.
            </p>
            {[...templatesByCategory.entries()].map(([category, categoryTemplates]) => (
              <div key={category} className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {category}
                </h4>
                {categoryTemplates.map((t) => (
                  <label
                    key={t.id}
                    className="flex items-start gap-3 rounded-md border p-3 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="mt-1 size-4"
                      checked={selectedTemplateIds.has(t.id)}
                      onChange={() => toggleTemplate(t.id)}
                    />
                    <span>
                      <span className="block font-medium">{t.title}</span>
                      <span className="block text-muted-foreground">{t.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        )}

        {isReviewStep && (
          <div className="space-y-3 text-sm">
            <div className="rounded-md border p-3">
              <p className="font-medium">{basics.name || "(unnamed group)"}</p>
              <p className="text-muted-foreground capitalize">
                {basics.type} · {basics.isPublic === "true" ? "Public" : "Private"} ·{" "}
                {basics.requireApproval === "true" ? "Requires approval" : "Auto-approve"}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="font-medium">Vehicles</p>
              <p className="text-muted-foreground">
                {VEHICLE_OPTIONS.filter((v) => vehicles[v.key])
                  .map((v) => v.label)
                  .join(", ") || "None — savings/contributions only"}
              </p>
            </div>
            {hasConfigStep && (
              <div className="rounded-md border p-3">
                <p className="font-medium">Loan terms</p>
                <p className="text-muted-foreground">
                  {loanSettings.loanInterestRate}% interest, up to{" "}
                  {loanSettings.loanMaxMultiplier}× savings, {loanSettings.loanRepaymentMonths}
                  -month repayment, Ksh {loanSettings.loanLatePenalty} late penalty,{" "}
                  {loanSettings.loanMinGuarantors === "0"
                    ? "no guarantors required"
                    : `${loanSettings.loanMinGuarantors} guarantor(s) required`}
                  .
                </p>
              </div>
            )}
            <div className="rounded-md border p-3">
              <p className="font-medium">Starter rules</p>
              <p className="text-muted-foreground">
                {selectedTemplateIds.size === 0
                  ? "None selected."
                  : `${selectedTemplateIds.size} rule${selectedTemplateIds.size === 1 ? "" : "s"} will be added.`}
              </p>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-between pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={step === 0 || pending}
            onClick={() => setStep((s) => s - 1)}
          >
            Back
          </Button>
          {step < lastStep ? (
            <Button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={isBasicsStep && !basicsValid}
            >
              Next
            </Button>
          ) : (
            <Button type="button" onClick={finish} disabled={pending || !basicsValid}>
              {pending ? "Creating…" : "Create group"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SuperAdminGroupsManager({
  groups,
  platformUsers,
  activities,
  finance,
}: {
  groups: Group[];
  platformUsers: PlatformUser[];
  activities: AccountActivity[];
  finance: Map<number, GroupFinance>;
}) {
  const [query, setQuery] = useState("");
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  const filteredGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return groups;
    return groups.filter((group) =>
      [group.name, group.type, group.description].some(
        (value) => typeof value === "string" && value.toLowerCase().includes(needle),
      ),
    );
  }, [groups, query]);

  async function handleActiveChange(group: Group) {
    setSavingId(group.id);
    const result = await setGroupActiveAction(group.id, !group.active);
    setSavingId(null);
    if (result && "error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(group.active ? "Group deactivated" : "Group reactivated");
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <CreateGroupWizard />
      </div>
      <Card>
        <CardContent className="space-y-4 overflow-x-auto">
          <Input
            aria-label="Search groups"
            placeholder="Search by group name, type, or description"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Onboarding</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Next follow-up</TableHead>
                <TableHead>Subscription</TableHead>
                <TableHead>Pending</TableHead>
                <TableHead>Payment pending</TableHead>
                <TableHead>Collected</TableHead>
                <TableHead>Visibility</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={14} className="text-center text-muted-foreground">
                    No groups match the current search.
                  </TableCell>
                </TableRow>
              )}
              {filteredGroups.map((g) => (
                <TableRow key={g.id}>
                  {(() => {
                    const billing = finance.get(g.id) ?? { pendingAmount: "0", pendingCount: 0, latestStatus: "none", latestAmount: "0", paidAmount: "0", pendingPaymentAmount: "0" };
                    return <>
                  <TableCell className="font-medium">{g.name}</TableCell>
                  <TableCell className="capitalize">{g.type}</TableCell>
                  <TableCell className="capitalize">{g.onboardingStage.replace("_", " ")}</TableCell>
                  <TableCell className="capitalize">{g.accountTier}</TableCell>
                  <TableCell>{platformUsers.find((user) => user.id === g.accountOwnerUserId)?.name ?? "Unassigned"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {g.nextFollowUpAt ? new Date(g.nextFollowUpAt).toLocaleDateString() : "None"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={billing.latestStatus === "paid" ? "secondary" : billing.latestStatus === "pending" ? "outline" : "secondary"}>
                      {billing.latestStatus === "none" ? "No invoice" : billing.latestStatus}
                    </Badge>
                    {billing.latestStatus !== "none" && <span className="ml-2 text-xs text-muted-foreground">Ksh {Number(billing.latestAmount).toLocaleString()}</span>}
                  </TableCell>
                  <TableCell className={Number(billing.pendingAmount) > 0 ? "font-medium text-destructive" : "text-muted-foreground"}>
                    {Number(billing.pendingAmount) > 0 ? `Ksh ${Number(billing.pendingAmount).toLocaleString()}` : "None"}
                    {billing.pendingCount > 1 && <span className="ml-1 text-xs">({billing.pendingCount})</span>}
                  </TableCell>
                  <TableCell className={Number(billing.pendingPaymentAmount) > 0 ? "font-medium text-amber-700" : "text-muted-foreground"}>
                    {Number(billing.pendingPaymentAmount) > 0 ? `Ksh ${Number(billing.pendingPaymentAmount).toLocaleString()}` : "None"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">Ksh {Number(billing.paidAmount).toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant={g.isPublic ? "secondary" : "outline"}>
                      {g.isPublic ? "Public" : "Private"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={g.active ? "secondary" : "destructive"}>
                      {g.active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(g.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditingGroup(g)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant={g.active ? "secondary" : "default"}
                        onClick={() => handleActiveChange(g)}
                        disabled={savingId === g.id}
                      >
                        {savingId === g.id ? "Working..." : g.active ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </TableCell>
                    </>;
                  })()}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {editingGroup && (
        <EditGroupDialog
          group={editingGroup}
          platformUsers={platformUsers}
          activities={activities.filter((activity) => activity.groupId === editingGroup.id)}
          onClose={() => setEditingGroup(null)}
        />
      )}
    </div>
  );
}

function EditGroupDialog({
  group,
  platformUsers,
  activities,
  onClose,
}: {
  group: Group;
  platformUsers: PlatformUser[];
  activities: AccountActivity[];
  onClose: () => void;
}) {
  const [name, setName] = useState(group.name);
  const [type, setType] = useState(group.type);
  const [description, setDescription] = useState(group.description ?? "");
  const [isPublic, setIsPublic] = useState(group.isPublic ? "true" : "false");
  const [requireApproval, setRequireApproval] = useState(group.requireApproval ? "true" : "false");
  const [maxMembers, setMaxMembers] = useState(group.maxMembers?.toString() ?? "");
  const [pending, setPending] = useState(false);
  const [contactPersonName, setContactPersonName] = useState(group.contactPersonName ?? "");
  const [contactPersonRole, setContactPersonRole] = useState(group.contactPersonRole ?? "");
  const [contactPersonPhone, setContactPersonPhone] = useState(group.contactPersonPhone ?? "");
  const [contactPersonEmail, setContactPersonEmail] = useState(group.contactPersonEmail ?? "");
  const [onboardingStage, setOnboardingStage] = useState(group.onboardingStage);
  const [accountTier, setAccountTier] = useState(group.accountTier);
  const [accountOwnerUserId, setAccountOwnerUserId] = useState(group.accountOwnerUserId?.toString() ?? "none");
  const [nextFollowUpAt, setNextFollowUpAt] = useState(
    group.nextFollowUpAt ? new Date(group.nextFollowUpAt).toISOString().slice(0, 16) : "",
  );
  const [internalNotes, setInternalNotes] = useState(group.internalNotes ?? "");
  const [activityNote, setActivityNote] = useState("");

  async function save() {
    setPending(true);
    const result = await updateGroupAction(group.id, {
      name,
      type,
      description,
      isPublic: isPublic === "true",
      requireApproval: requireApproval === "true",
      maxMembers: maxMembers ? Number(maxMembers) : null,
    });
    setPending(false);
    if (result && "error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success("Group settings updated");
    onClose();
  }

  async function saveAccountDetails() {
    setPending(true);
    const result = await updateGroupAccountAction(group.id, {
      contactPersonName,
      contactPersonRole,
      contactPersonPhone,
      contactPersonEmail,
      onboardingStage,
      accountTier,
      accountOwnerUserId: accountOwnerUserId === "none" ? null : Number(accountOwnerUserId),
      nextFollowUpAt,
      internalNotes,
      activityNote,
    });
    setPending(false);
    if (result && "error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success("Account details updated");
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit group</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-group-name">Name</Label>
            <Input id="edit-group-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-group-type">Type</Label>
            <Select value={type} onValueChange={(value) => setType(value ?? group.type)} items={Object.fromEntries(groupTypes.map((item) => [item, item]))}>
              <SelectTrigger id="edit-group-type" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {groupTypes.map((item) => <SelectItem key={item} value={item} className="capitalize">{item}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-group-description">Description</Label>
            <Input id="edit-group-description" value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-group-visibility">Visibility</Label>
              <Select value={isPublic} onValueChange={(value) => setIsPublic(value ?? "true")} items={{ true: "Public", false: "Private" }}>
                <SelectTrigger id="edit-group-visibility" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="true">Public</SelectItem><SelectItem value="false">Private</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-group-joining">Joining</Label>
              <Select value={requireApproval} onValueChange={(value) => setRequireApproval(value ?? "true")} items={{ true: "Requires approval", false: "Auto-approve" }}>
                <SelectTrigger id="edit-group-joining" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="true">Requires approval</SelectItem><SelectItem value="false">Auto-approve</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-group-max-members">Max members (optional)</Label>
            <Input id="edit-group-max-members" type="number" min="1" step="1" value={maxMembers} onChange={(event) => setMaxMembers(event.target.value)} />
          </div>
          <div className="border-t pt-4">
            <h3 className="mb-3 text-sm font-semibold">Account management</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="contact-person-name">Contact person</Label><Input id="contact-person-name" value={contactPersonName} onChange={(event) => setContactPersonName(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="contact-person-role">Contact role</Label><Input id="contact-person-role" placeholder="Chairperson, secretary..." value={contactPersonRole} onChange={(event) => setContactPersonRole(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="contact-person-email">Contact email</Label><Input id="contact-person-email" type="email" value={contactPersonEmail} onChange={(event) => setContactPersonEmail(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="contact-person-phone">Contact phone</Label><Input id="contact-person-phone" value={contactPersonPhone} onChange={(event) => setContactPersonPhone(event.target.value)} /></div>
              <div className="space-y-2"><Label htmlFor="onboarding-stage">Onboarding stage</Label>
                <Select value={onboardingStage} onValueChange={(value) => setOnboardingStage(value ?? group.onboardingStage)} items={{ lead: "Lead", contacted: "Contacted", demo: "Demo", registration: "Registration", verification: "Verification", training: "Training", active: "Active", at_risk: "At risk", churned: "Churned" }}>
                  <SelectTrigger id="onboarding-stage" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{["lead", "contacted", "demo", "registration", "verification", "training", "active", "at_risk", "churned"].map((value) => <SelectItem key={value} value={value}>{value.replace("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label htmlFor="account-tier">Account tier</Label>
                <Select value={accountTier} onValueChange={(value) => setAccountTier(value ?? group.accountTier)} items={{ standard: "Standard", key: "Key", strategic: "Strategic" }}>
                  <SelectTrigger id="account-tier" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="standard">Standard</SelectItem><SelectItem value="key">Key</SelectItem><SelectItem value="strategic">Strategic</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label htmlFor="account-owner">Account owner</Label>
                <Select value={accountOwnerUserId} onValueChange={(value) => setAccountOwnerUserId(value ?? "none")} items={Object.fromEntries([...[{ id: "none", name: "Unassigned" }], ...platformUsers].map((user) => [user.id.toString(), user.name]))}>
                  <SelectTrigger id="account-owner" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Unassigned</SelectItem>{platformUsers.map((user) => <SelectItem key={user.id} value={user.id.toString()}>{user.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label htmlFor="next-follow-up">Next follow-up</Label><Input id="next-follow-up" type="datetime-local" value={nextFollowUpAt} onChange={(event) => setNextFollowUpAt(event.target.value)} /></div>
            </div>
            <div className="mt-4 space-y-2"><Label htmlFor="internal-notes">Internal notes</Label><Input id="internal-notes" value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} /></div>
            <div className="mt-4 space-y-2"><Label htmlFor="activity-note">Log follow-up note</Label><Input id="activity-note" placeholder="What happened or what needs attention?" value={activityNote} onChange={(event) => setActivityNote(event.target.value)} /></div>
            {activities.length > 0 && <div className="mt-4 space-y-2"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent activity</p>{activities.slice(0, 5).map((activity) => <div key={activity.id} className="rounded-md border p-2 text-sm"><p>{activity.note}</p><p className="text-xs text-muted-foreground">{new Date(activity.createdAt).toLocaleString()}</p></div>)}</div>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={pending}>{pending ? "Saving..." : "Save changes"}</Button>
            <Button onClick={saveAccountDetails} disabled={pending}>{pending ? "Saving..." : "Save account"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
