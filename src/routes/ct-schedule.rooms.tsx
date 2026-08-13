import { createFileRoute } from "@tanstack/react-router";
import { CTRoomViewPage } from "../features/ct-schedule/CTRoomViewPage";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/ct-schedule/rooms")({
  head: () => ({ meta: [{ title: "CT Room View · Routine Manager" }] }),
  component: () => (
    <AppShell>
      <CTRoomViewPage />
    </AppShell>
  ),
});
