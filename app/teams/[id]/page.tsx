import type { Metadata } from "next";
import { TeamProfilePage } from "@/components/team-profile";

export const metadata: Metadata = { title: "Профиль команды" };
export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TeamProfilePage key={id} id={id} />;
}
