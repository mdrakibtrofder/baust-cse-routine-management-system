import { createFileRoute } from "@tanstack/react-router";
import { CourseCTSchedulePage } from "@/features/ct-schedule/CourseCTSchedulePage";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/ct-schedule/course-wise")({
  head: () => ({ meta: [{ title: "Course CT Schedule · Routine Manager" }] }),
  component: () => (
    <AppShell>
      <CourseCTSchedulePage />
    </AppShell>
  ),
});
