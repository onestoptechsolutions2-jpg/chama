import { eq } from "drizzle-orm";
import { requireActiveGroup } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { projects, members } from "@/lib/db/schema";
import { PageHeader } from "@/components/feature/page-header";
import { ProjectsManager } from "@/components/feature/projects-manager";

export default async function ProjectsPage() {
  const session = await requireActiveGroup();
  const groupId = session.activeMembership.groupId;
  const canEdit = ["admin", "treasurer"].includes(session.activeMembership.role);

  const [groupProjects, groupMembers] = await withTenant(groupId, (tx) =>
    Promise.all([
      tx.query.projects.findMany({
        where: eq(projects.groupId, groupId),
        orderBy: (p, { desc }) => [desc(p.createdAt)],
      }),
      tx.query.members.findMany({
        where: eq(members.active, true),
        orderBy: (m, { asc }) => [asc(m.name)],
      }),
    ]),
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Projects" description="Table-banking / group projects and contributions." />
      <ProjectsManager projects={groupProjects} members={groupMembers} canEdit={canEdit} />
    </div>
  );
}
