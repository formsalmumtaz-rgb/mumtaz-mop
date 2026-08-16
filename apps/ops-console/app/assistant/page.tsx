import { requireView } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { AssistantChat } from "./ui";

// Item 5 — Claude inside MOP, phase 1. Supreme-admin surface only.
export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  await requireView("settings.manage");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Ask the business"
        description="Answers come from the platform's own data, prepared by deterministic queries — the assistant explains the business, it never runs it. Every question is logged."
      />
      <AssistantChat />
    </div>
  );
}
