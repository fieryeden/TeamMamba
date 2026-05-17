import { NextRequest, NextResponse } from "next/server";
import { TRANSLATIONS, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/locales";

/**
 * GET /api/i18n/[locale]
 * Returns the translation dictionary for a given locale.
 * Used for dynamic loading of locale strings.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ locale: string }> }
) {
  const { locale } = await params;

  if (!SUPPORTED_LOCALES.includes(locale as Locale)) {
    return NextResponse.json(
      { error: "Unsupported locale", supported: SUPPORTED_LOCALES },
      { status: 400 }
    );
  }

  const translations = TRANSLATIONS[locale as Locale] ?? TRANSLATIONS.en;

  return NextResponse.json(
    { locale, translations },
    {
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    }
  );
}
