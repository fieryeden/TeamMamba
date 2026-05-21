import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { hashPassword, verifyPassword, signToken } from "@/lib/auth";
import { verifyTotpToken } from "@/lib/totp";
import {
  registerSchema,
  loginSchema,
  updateThemePreferenceSchema,
  notificationPreferencesSchema,
  onboardingSchema,
} from "@/lib/validations";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, firstName, lastName } = registerSchema.parse(body);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, passwordHash, firstName, lastName },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    });

    // Create a personal workspace
    const workspace = await prisma.workspace.create({
      data: {
        name: `${firstName}'s Workspace`,
        ownerId: user.id,
        members: { create: { userId: user.id, role: "OWNER" } },
      },
    });

    const token = signToken({ userId: user.id, email: user.email });

    const res = NextResponse.json({ user, workspace, token }, { status: 201 });
    res.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" && process.env.SECURE_COOKIES === "true",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });
    return res;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ error: "Invalid input", details: err }, { status: 400 });
    }
    console.error("Register error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Login
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = loginSchema.parse(body);
    const totpCode = typeof body.totpCode === "string" ? body.totpCode : "";

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    if (user.twoFactorEnabled) {
      if (!totpCode) {
        return NextResponse.json(
          { error: "2FA code required", requiresTwoFactor: true },
          { status: 401 }
        );
      }
      if (!user.twoFactorSecret || !verifyTotpToken(user.twoFactorSecret, totpCode)) {
        return NextResponse.json({ error: "Invalid 2FA code", requiresTwoFactor: true }, { status: 401 });
      }
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const token = signToken({ userId: user.id, email: user.email });

    const res = NextResponse.json({
      user: {
        id: user.id, email: user.email, firstName: user.firstName,
        lastName: user.lastName, role: user.role, avatarUrl: user.avatarUrl,
      },
      token,
    });
    res.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" && process.env.SECURE_COOKIES === "true",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    return res;
  } catch (err: unknown) {
    console.error("Login error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Update profile
export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { firstName, lastName, themePreference } = body as {
      firstName?: string;
      lastName?: string;
      themePreference?: string;
    };
    const notificationPrefs = notificationPreferencesSchema.parse(body);
    const onboarding = onboardingSchema.parse(body);

    const data: Record<string, unknown> = {};
    if (firstName?.trim()) data.firstName = firstName.trim();
    if (lastName?.trim()) data.lastName = lastName.trim();
    if (themePreference) {
      const parsedTheme = updateThemePreferenceSchema.parse({ themePreference });
      data.themePreference = parsedTheme.themePreference;
    }
    if (notificationPrefs.emailNotificationsEnabled !== undefined) {
      data.emailNotificationsEnabled = notificationPrefs.emailNotificationsEnabled;
    }
    if (notificationPrefs.emailOnMentions !== undefined) {
      data.emailOnMentions = notificationPrefs.emailOnMentions;
    }
    if (notificationPrefs.emailOnAssignments !== undefined) {
      data.emailOnAssignments = notificationPrefs.emailOnAssignments;
    }
    if (notificationPrefs.emailOnDueDates !== undefined) {
      data.emailOnDueDates = notificationPrefs.emailOnDueDates;
    }
    if (onboarding.onboardingCompleted !== undefined) {
      data.onboardingCompleted = onboarding.onboardingCompleted;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        themePreference: true,
        emailNotificationsEnabled: true,
        emailOnMentions: true,
        emailOnAssignments: true,
        emailOnDueDates: true,
        onboardingCompleted: true,
      },
    });

    return NextResponse.json({ user: updated });
  } catch (err) {
    console.error("Update profile error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}


// Logout - clear session cookie
export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.set("token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && process.env.SECURE_COOKIES === "true",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return res;
}
