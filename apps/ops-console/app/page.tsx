import { redirect } from "next/navigation";

// Release 1 item 7 — this used to be an orphan "Master data" landing page that was
// not in the nav. Its ASSUMED-values backlog now lives on the dashboard as a
// "Needs attention" tile (getAssumedBacklog); the root simply goes to the day view.
export const dynamic = "force-dynamic";

export default function Home() {
  redirect("/dashboard");
}
