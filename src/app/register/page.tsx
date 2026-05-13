import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/session";
import { RegisterForm } from "@/components/auth/register-form";

export default async function RegisterPage() {
  const user = await getAuthUser();
  if (user) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30">
      <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[400px]">
        <div className="flex flex-col space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-mamba-600 text-white font-bold text-xl">
            TM
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
          <p className="text-sm text-muted-foreground">
            Start managing your projects with TeamMamba
          </p>
        </div>
        <RegisterForm />
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <a href="/login" className="text-mamba-600 hover:text-mamba-700 font-medium">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
