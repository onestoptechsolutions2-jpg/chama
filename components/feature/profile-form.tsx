"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import type { members as membersTable } from "@/lib/db/schema";
import { updateMyKycAction, type ProfileActionState } from "@/app/(dashboard)/profile/actions";
import { requiredKycFields, isKycComplete, type MembershipRole } from "@/lib/domain/officials";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUpload } from "@/components/feature/file-upload";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Member = typeof membersTable.$inferSelect;

export function ProfileForm({ member, role }: { member: Member; role: MembershipRole }) {
  const [state, formAction, pending] = useActionState<ProfileActionState, FormData>(
    async (prev, formData) => {
      const result = await updateMyKycAction(prev, formData);
      if (result && "ok" in result) toast.success("Profile saved");
      return result;
    },
    null,
  );

  const needsOfficialFields = requiredKycFields(role).includes("address");
  const complete = isKycComplete(role, member);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{member.name}</CardTitle>
          <Badge variant={complete ? "secondary" : "outline"}>
            {complete ? "KYC complete" : "KYC incomplete"}
          </Badge>
          {needsOfficialFields && (
            <Badge variant="outline" className="capitalize">
              {role} — requires address & signature
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="idType">ID type</Label>
              <Select
                name="idType"
                defaultValue={member.idType ?? "national_id"}
                items={{ national_id: "National ID", passport: "Passport" }}
              >
                <SelectTrigger id="idType" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="national_id">National ID</SelectItem>
                  <SelectItem value="passport">Passport</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="idNumber">ID number</Label>
              <Input id="idNumber" name="idNumber" defaultValue={member.idNumber ?? ""} />
            </div>
          </div>

          <FileUpload
            name="idDocumentUrl"
            label="ID document photo"
            defaultUrl={member.idDocumentUrl}
          />

          <div className="space-y-2 sm:w-64">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              name="phone"
              placeholder="0712345678"
              defaultValue={member.phone ?? ""}
            />
          </div>

          <FileUpload name="photoUrl" label="Your photo" defaultUrl={member.photoUrl} />

          {needsOfficialFields && (
            <>
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Textarea id="address" name="address" defaultValue={member.address ?? ""} />
              </div>
              <FileUpload
                name="signatureUrl"
                label="Signature"
                defaultUrl={member.signatureUrl}
              />
            </>
          )}

          {state && "error" in state && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save profile"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
