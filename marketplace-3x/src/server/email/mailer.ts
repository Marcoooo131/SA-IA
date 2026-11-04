import { db } from "../db";

/**
 * E-mails transactionnels. Chaque e-mail est d'abord écrit dans EmailOutbox (traçabilité),
 * puis envoyé si SMTP_URL est défini. Sans SMTP (développement), il reste consultable dans /admin/emails.
 */
export async function queueEmail(to: string, subject: string, text: string) {
  const mail = await db.emailOutbox.create({ data: { to, subject, text } });
  if (process.env.SMTP_URL) {
    try {
      const nodemailer = await import("nodemailer");
      const transport = nodemailer.createTransport(process.env.SMTP_URL);
      await transport.sendMail({ from: process.env.EMAIL_FROM, to, subject, text });
      await db.emailOutbox.update({ where: { id: mail.id }, data: { status: "SENT", sentAt: new Date() } });
    } catch (e) {
      await db.emailOutbox.update({ where: { id: mail.id }, data: { status: "FAILED", error: String(e) } });
    }
  }
  return mail;
}
