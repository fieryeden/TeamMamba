type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

let cachedTransporter: any;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodemailer = require("nodemailer");
    cachedTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || "587"),
      secure: String(process.env.SMTP_SECURE || "false") === "true",
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          }
        : undefined,
    });
    return cachedTransporter;
  } catch {
    return null;
  }
}

export async function sendEmail(input: SendMailInput) {
  const transporter = getTransporter();
  if (!transporter) {
    console.log("[mail:fallback]", input);
    return;
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER || "teammamba@localhost",
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}
