import { Toaster } from "@/components/ui/sonner";
import { AppLayout } from "@/components/AppLayout";
import { useStore } from "@/lib/store";
import { LoginPage } from "@/components/LoginPage";

export function AppShell({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useStore((s) => !!s.auth.token);

  if (!isAuthenticated) {
    return (
      <>
        <LoginPage />
        <Toaster richColors position="top-right" />
      </>
    );
  }

  return (
    <>
      <AppLayout>{children}</AppLayout>
      <Toaster richColors position="top-right" />
    </>
  );
}
