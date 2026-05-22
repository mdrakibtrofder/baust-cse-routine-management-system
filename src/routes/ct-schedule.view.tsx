import { createFileRoute } from "@tanstack/react-router";
import { CourseCTSchedulePage } from "@/features/ct-schedule/CourseCTSchedulePage";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/ct-schedule/view")({
  head: () => ({ meta: [{ title: "CT Schedule View · Routine Manager" }] }),
  component: () => (
    <AppShell>
      <CourseCTSchedulePage />
    </AppShell>
  ),
});
