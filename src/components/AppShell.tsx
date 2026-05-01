import { Toaster } from "@/components/ui/sonner";
import { AppLayout } from "@/components/AppLayout";

export function AppShell({ children }: { children: React.ReactNode }) {
  // Authentication disabled for private network deployment
  return (
    <>
      <AppLayout>{children}</AppLayout>
      <Toaster richColors position="top-right" />
    </>
  );
}
