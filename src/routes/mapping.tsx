import { createFileRoute } from "@tanstack/react-router";
import { RoomTimeMappingPage } from "@/features/mapping/RoomTimeMappingPage";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/mapping")({
  component: () => (
    <AppShell>
      <RoomTimeMappingPage />
    </AppShell>
  ),
});
