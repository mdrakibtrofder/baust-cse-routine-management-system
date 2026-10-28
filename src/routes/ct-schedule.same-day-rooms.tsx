import { createFileRoute } from "@tanstack/react-router";
import { CTSameDayRoomPage } from "@/features/ct-schedule/CTSameDayRoomPage";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/ct-schedule/same-day-rooms")({
  head: () => ({ meta: [{ title: "Same-Day CT · Room · Routine Manager" }] }),
  component: () => (
    <AppShell>
      <CTSameDayRoomPage />
    </AppShell>
  ),
});
