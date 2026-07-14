"use server";

import { revalidatePath } from "next/cache";
import { setActiveGroup } from "@/lib/auth/session";

export async function switchGroupAction(groupId: number): Promise<void> {
  await setActiveGroup(groupId);
  revalidatePath("/", "layout");
}
