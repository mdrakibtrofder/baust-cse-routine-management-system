import { createFileRoute } from "@tanstack/react-router";
import { RoomsPage } from "@/features/rooms/RoomsPage";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/rooms")({
  head: () => ({ meta: [{ title: "Rooms · Routine Manager" }] }),
  component: () => (
    <AppShell>
      <RoomsPage />
    </AppShell>
  ),
});
