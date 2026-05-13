import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/session";

export default async function HomePage() {
  const user = await getAuthUser();
  if (user) {
    redirect("/dashboard");
  }
  redirect("/login");
}
