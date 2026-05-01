import { createFileRoute } from "@tanstack/react-router";
import { ReportsPage } from "@/features/reports/ReportsPage";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ title: "Reports · Routine Manager" }] }),
  component: () => (
    <AppShell>
      <ReportsPage />
    </AppShell>
  ),
});
