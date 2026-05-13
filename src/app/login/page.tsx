import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/session";
import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage() {
  const user = await getAuthUser();
  if (user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30">
      <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[400px]">
        <div className="flex flex-col space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-mamba-600 text-white font-bold text-xl">
            TM
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome to TeamMamba</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to manage your projects and tasks
          </p>
        </div>
        <LoginForm />
        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <a href="/register" className="text-mamba-600 hover:text-mamba-700 font-medium">
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}
