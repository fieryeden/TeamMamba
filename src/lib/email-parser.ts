import { randomUUID } from "crypto";

export interface InboundAttachment {
  filename: string;
  contentType: string;
  size: number;
  content?: Buffer;
  contentBase64?: string;
}

export interface InboundEmail {
  provider: "resend" | "mailgun" | "postmark" | "unknown";
  to: string[];
  fromAddress: string;
  fromName: string | null;
  subject: string;
  textBody: string;
  htmlBody: string;
  attachments: InboundAttachment[];
  raw: unknown;
}

function parseAddress(input: string): { name: string | null; email: string } {
  const trimmed = input.trim();
  const match = trimmed.match(/^(.*)<([^>]+)>$/);
  if (match) {
    return {
      name: match[1]?.trim().replace(/^"|"$/g, "") || null,
      email: match[2].trim().toLowerCase(),
    };
  }
  return { name: null, email: trimmed.toLowerCase() };
}

function parseToList(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((entry) => parseAddress(entry).email);
  }
  return raw
    .split(/[;,]/)
    .map((entry) => parseAddress(entry).email)
    .filter(Boolean);
}

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return String(value);
}

function parseAttachmentsFromJson(raw: unknown): InboundAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      const attachment = entry as Record<string, unknown>;
      const filename = asString(attachment.filename || attachment.name || `attachment-${randomUUID()}`);
      const contentType = asString(attachment.contentType || attachment.type || "application/octet-stream") || "application/octet-stream";
      const contentBase64 = typeof attachment.content === "string"
        ? attachment.content
        : typeof attachment.contentBase64 === "string"
          ? attachment.contentBase64
          : undefined;
      const size = typeof attachment.size === "number"
        ? attachment.size
        : contentBase64
          ? Buffer.from(contentBase64, "base64").byteLength
          : 0;
      return {
        filename,
        contentType,
        size,
        contentBase64,
      };
    })
    .filter((entry) => entry.filename.length > 0);
}

async function parseFormData(formData: FormData): Promise<InboundAttachment[]> {
  const attachments: InboundAttachment[] = [];

  for (const [key, value] of formData.entries()) {
    if (!(value instanceof File)) continue;
    const lowerKey = key.toLowerCase();
    const isAttachment = lowerKey.startsWith("attachment") || lowerKey.includes("file");
    if (!isAttachment) continue;

    const bytes = await value.arrayBuffer();
    attachments.push({
      filename: value.name || `attachment-${randomUUID()}`,
      contentType: value.type || "application/octet-stream",
      size: value.size,
      content: Buffer.from(bytes),
    });
  }

  return attachments;
}

export async function parseInboundEmailRequest(req: Request): Promise<InboundEmail> {
  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("application/json")) {
    const body = (await req.json()) as Record<string, unknown>;

    // Postmark webhook format
    if (typeof body.From === "string" || typeof body.TextBody === "string" || typeof body.HtmlBody === "string") {
      const from = parseAddress(asString(body.From));
      return {
        provider: "postmark",
        to: parseToList(typeof body.To === "string" ? body.To : undefined),
        fromAddress: from.email,
        fromName: typeof body.FromName === "string" ? body.FromName : from.name,
        subject: asString(body.Subject) || "No Subject",
        textBody: asString(body.TextBody),
        htmlBody: asString(body.HtmlBody),
        attachments: parseAttachmentsFromJson(body.Attachments),
        raw: body,
      };
    }

    // Resend style inbound JSON
    if (body.email && typeof body.email === "object") {
      const email = body.email as Record<string, unknown>;
      const from = parseAddress(asString(email.from));
      return {
        provider: "resend",
        to: parseToList((email.to as string[] | string | undefined) ?? (body.to as string[] | string | undefined)),
        fromAddress: from.email,
        fromName: from.name,
        subject: asString(email.subject) || "No Subject",
        textBody: asString(email.text),
        htmlBody: asString(email.html),
        attachments: parseAttachmentsFromJson(email.attachments),
        raw: body,
      };
    }

    // Generic JSON fallback
    const from = parseAddress(asString(body.from || body.sender));
    return {
      provider: "unknown",
      to: parseToList((body.to as string | string[] | undefined) ?? (body.recipient as string | string[] | undefined)),
      fromAddress: from.email,
      fromName: from.name,
      subject: asString(body.subject) || "No Subject",
      textBody: asString(body.text || body["body-plain"]),
      htmlBody: asString(body.html || body["body-html"]),
      attachments: parseAttachmentsFromJson(body.attachments),
      raw: body,
    };
  }

  if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await req.formData();
    const from = parseAddress(asString(formData.get("from") ?? formData.get("sender") ?? ""));

    return {
      provider: formData.has("MessageID") || formData.has("message-headers") ? "mailgun" : "unknown",
      to: parseToList(asString(formData.get("to") ?? formData.get("recipient") ?? "")),
      fromAddress: from.email,
      fromName: from.name,
      subject: asString(formData.get("subject")) || "No Subject",
      textBody: asString(formData.get("text") ?? formData.get("body-plain")),
      htmlBody: asString(formData.get("html") ?? formData.get("body-html")),
      attachments: await parseFormData(formData),
      raw: Object.fromEntries(formData.entries()),
    };
  }

  throw new Error("Unsupported inbound payload format");
}

export function getPrimaryRecipientAddress(email: InboundEmail): string | null {
  const first = email.to[0]?.trim().toLowerCase();
  return first || null;
}
