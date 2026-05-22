import { createFileRoute } from "@tanstack/react-router";
import { CTTableViewPage } from "../features/ct-schedule/CTTableViewPage";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/ct-schedule/table")({
  head: () => ({ meta: [{ title: "CT Table View · Routine Manager" }] }),
  component: () => (
    <AppShell>
      <CTTableViewPage />
    </AppShell>
  ),
});
