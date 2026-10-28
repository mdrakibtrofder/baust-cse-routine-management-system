import { createFileRoute } from "@tanstack/react-router";
import { RescheduleCTPage } from "@/features/ct-schedule/RescheduleCTPage";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/ct-schedule/reschedule")({
  head: () => ({ meta: [{ title: "Reschedule CT · Routine Manager" }] }),
  component: () => (
    <AppShell>
      <RescheduleCTPage />
    </AppShell>
  ),
});
