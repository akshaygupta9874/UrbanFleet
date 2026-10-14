export const APP_NAME = process.env.APP_NAME || "Authentication App";
export const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

export const sendSendGridEmail = async ({ to, subject, html }: SendEmailParams) => {
  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
  const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "no-reply@example.com";

  if (!SENDGRID_API_KEY) {
    throw new Error("SENDGRID_API_KEY is not defined in environment variables");
  }

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: FROM_EMAIL, name: APP_NAME },
      subject: subject,
      content: [{ type: "text/html", value: html }],
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to send email via SendGrid: ${errorData}`);
  }

  return response;
};