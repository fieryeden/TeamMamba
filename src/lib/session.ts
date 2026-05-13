import { cookies } from "next/headers";
import { verifyToken } from "./auth";
import { prisma } from "./prisma";

export async function getAuthUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      role: true,
      status: true,
      timezone: true,
    },
  });

  return user;
}
