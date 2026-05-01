import { useState } from "react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, Loader2 } from "lucide-react";

export function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const login = useStore((s) => s.login);
  const isLoading = useStore((s) => s.isLoading);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await login(username, password);
    } catch (err: any) {
      setError(err.message || "Login failed. Check your credentials.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md shadow-xl border-none">
        <CardHeader className="space-y-4 flex flex-col items-center pb-8">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center text-primary-foreground shadow-lg bg-primary" style={{ background: "var(--gradient-primary)" }}>
            <GraduationCap className="h-7 w-7" />
          </div>
          <div className="text-center">
            <CardTitle className="text-2xl font-bold tracking-tight">Routine Manager</CardTitle>
            <CardDescription className="text-muted-foreground mt-1">Sign in to manage CSE department routine</CardDescription>
          </div>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm font-medium border border-destructive/20 text-center">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Input
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11"
              />
            </div>
          </CardContent>
          <CardFooter className="pt-4 pb-8 flex flex-col gap-4">
            <Button type="submit" className="w-full h-11 text-base font-semibold shadow-md" disabled={isLoading}>
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Sign In"}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">
              Default: admin / admin123 (after seeding)
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
