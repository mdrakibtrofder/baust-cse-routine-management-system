import { createFileRoute } from "@tanstack/react-router";
import { CTTeacherViewPage } from "../features/ct-schedule/CTTeacherViewPage";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/ct-schedule/teachers")({
  head: () => ({ meta: [{ title: "CT Teacher View · Routine Manager" }] }),
  component: () => (
    <AppShell>
      <CTTeacherViewPage />
    </AppShell>
  ),
});
