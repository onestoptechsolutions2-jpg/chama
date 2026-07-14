import { requireActiveGroup } from "@/lib/auth/session";
import { PageHeader } from "@/components/feature/page-header";
import { RoleGuide } from "@/components/feature/role-guide";

export default async function GuidePage() {
  const session = await requireActiveGroup();

  return (
    <div className="space-y-6">
      <PageHeader title="Guide" description="What you can do here, based on your role and this group's type." />
      <RoleGuide
        role={session.activeMembership.role}
        groupType={session.activeMembership.groupType}
        groupName={session.activeMembership.groupName}
      />
    </div>
  );
}
