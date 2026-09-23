import { NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { api } from "@/lib/http";
import { publicTeamProfile } from "@/lib/team-server";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return api(async () => publicTeamProfile((await context.params).id, await currentUser()));
}
