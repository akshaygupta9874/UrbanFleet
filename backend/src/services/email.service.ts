import { APP_NAME, FRONTEND_URL, sendSendGridEmail } from "../config/sendgrid.config.js";

interface OtpEmailParams {
  email: string;
  otp: string;
  expiresInMinutes?: number;
}

interface VerifyEmailParams {
  email: string;
  token: string;
}

interface ResetPasswordEmailParams {
  email: string;
  token: string;
}

const ACCENT = "#111827"; 
const YEAR = new Date().getFullYear();

const baseStyles = `
html, body { margin: 0; padding: 0; }
body {
  background: #f6f7fb;
  color: #111;
  -webkit-text-size-adjust: 100%;
  -ms-text-size-adjust: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial,
    'Apple Color Emoji','Segoe UI Emoji','Segoe UI Symbol', sans-serif;
}
table { border-collapse: collapse; }
img { border: 0; line-height: 100%; outline: none; text-decoration: none; display: block; max-width: 100%; height: auto; }
.wrapper { width: 100%; background: #f6f7fb; }
.container {
  width: 600px;
  max-width: 600px;
  background: #ffffff;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #e9ecf3;
}
.p-24 { padding: 24px; }
.p-32 { padding: 32px; }
.header {
  background: ${ACCENT};
  padding: 20px 24px;
  text-align: center;
}
.brand {
  display: inline-block;
  color: #ffffff;
  font-weight: 700;
  font-size: 17px;
  letter-spacing: 0.3px;
  text-decoration: none;
}
.title { margin: 0 0 12px 0; font-size: 22px; line-height: 1.3; color: #111; font-weight: 700; }
.text { margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #444; }
.muted { color: #555; font-size: 14px; line-height: 1.6; margin: 0 0 12px 0; }
.otp-wrap { margin: 24px 0; width: 100%; }
.otp {
  display: inline-block;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 16px 22px;
  font-size: 32px;
  letter-spacing: 10px;
  font-weight: 700;
  color: #111;
  font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}
.btn {
  display: inline-block;
  background: ${ACCENT};
  color: #ffffff !important;
  text-decoration: none;
  padding: 12px 20px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 14px;
}
.link { color: ${ACCENT}; text-decoration: underline; word-break: break-all; }
.footer { text-align: center; color: #6b7280; font-size: 12px; line-height: 1.6; padding: 16px 24px 0 24px; }
@media only screen and (max-width: 600px) {
  .container { width: 100% !important; }
  .p-32 { padding: 24px !important; }
  .otp { font-size: 26px !important; letter-spacing: 6px !important; }
}
`;

export const getOtpHtml = ({ email, otp, expiresInMinutes = 5 }: OtpEmailParams): string => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<title>${APP_NAME} Verification Code</title>
<style>${baseStyles}</style>
</head>
<body>
<table role="presentation" class="wrapper" width="100%" border="0" cellspacing="0" cellpadding="0">
<tr>
<td align="center" class="p-24">
<table role="presentation" class="container" border="0" cellspacing="0" cellpadding="0">
<tr>
<td class="header">
<span class="brand">${APP_NAME}</span>
</td>
</tr>
<tr>
<td class="p-32">
<h1 class="title">Verify your email</h1>
<p class="text">
Use the verification code below to complete your sign-in to <strong>${APP_NAME}</strong> as <strong>${email}</strong>.
</p>
<table role="presentation" class="otp-wrap" border="0" cellspacing="0" cellpadding="0">
<tr>
<td align="center">
<div class="otp">${otp}</div>
</td>
</tr>
</table>
<p class="muted">This code will expire in <strong>${expiresInMinutes} minutes</strong>.</p>
<p class="muted">If you didn't request this, you can safely ignore this email.</p>
</td>
</tr>
<tr>
<td class="footer">
© ${YEAR} ${APP_NAME}. All rights reserved.
</td>
</tr>
<tr>
<td height="16" aria-hidden="true"></td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
};

export const getVerifyEmailHtml = ({ email, token }: VerifyEmailParams): string => {
  const verifyUrl = `${FRONTEND_URL.replace(/\/+$/, "")}/token/${encodeURIComponent(token)}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<title>${APP_NAME} Verify Your Account</title>
<style>${baseStyles}</style>
</head>
<body>
<table role="presentation" class="wrapper" width="100%" border="0" cellspacing="0" cellpadding="0">
<tr>
<td align="center" class="p-24">
<table role="presentation" class="container" border="0" cellspacing="0" cellpadding="0">
<tr>
<td class="header">
<span class="brand">${APP_NAME}</span>
</td>
</tr>
<tr>
<td class="p-32">
<h1 class="title">Verify your account</h1>
<p class="text">
Thanks for registering with ${APP_NAME} as <strong>${email}</strong>. Click the button below to verify your account.
</p>
<table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 16px 0 20px 0;">
<tr>
<td align="center">
<a class="btn" href="${verifyUrl}" target="_blank" rel="noopener">Verify account</a>
</td>
</tr>
</table>
<p class="muted">If the button doesn't work, copy and paste this link into your browser:</p>
<p class="muted"><a class="link" href="${verifyUrl}" target="_blank" rel="noopener">${verifyUrl}</a></p>
<p class="muted">If this wasn't you, you can safely ignore this email.</p>
</td>
</tr>
<tr>
<td class="footer">
© ${YEAR} ${APP_NAME}. All rights reserved.
</td>
</tr>
<tr>
<td height="16" aria-hidden="true"></td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
};

export const getResetPasswordHtml = ({ email, token }: ResetPasswordEmailParams): string => {
  const resetUrl = `${FRONTEND_URL.replace(/\/+$/, "")}/reset-password/${encodeURIComponent(token)}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<title>${APP_NAME} Reset Your Password</title>
<style>${baseStyles}</style>
</head>
<body>
<table role="presentation" class="wrapper" width="100%" border="0" cellspacing="0" cellpadding="0">
<tr>
<td align="center" class="p-24">
<table role="presentation" class="container" border="0" cellspacing="0" cellpadding="0">
<tr>
<td class="header">
<span class="brand">${APP_NAME}</span>
</td>
</tr>
<tr>
<td class="p-32">
<h1 class="title">Reset your password</h1>
<p class="text">
We received a request to reset the password for <strong>${email}</strong>. Click the button below to continue.
</p>
<table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 16px 0 20px 0;">
<tr>
<td align="center">
<a class="btn" href="${resetUrl}" target="_blank" rel="noopener">Reset password</a>
</td>
</tr>
</table>
<p class="muted">If the button doesn't work, copy and paste this link into your browser:</p>
<p class="muted"><a class="link" href="${resetUrl}" target="_blank" rel="noopener">${resetUrl}</a></p>
<p class="muted">If you didn't request this, you can safely ignore this email.</p>
</td>
</tr>
<tr>
<td class="footer">
© ${YEAR} ${APP_NAME}. All rights reserved.
</td>
</tr>
<tr>
<td height="16" aria-hidden="true"></td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
};

// Exported trigger functions
export const sendOtpEmail = async ({ email, otp, expiresInMinutes = 5 }: OtpEmailParams) => {
  return sendSendGridEmail({
    to: email,
    subject: `${otp} is your ${APP_NAME} verification code`,
    html: getOtpHtml({ email, otp, expiresInMinutes }),
  });
};

export const sendVerifyEmail = async ({ email, token }: VerifyEmailParams) => {
  return sendSendGridEmail({
    to: email,
    subject: `Verify your ${APP_NAME} account`,
    html: getVerifyEmailHtml({ email, token }),
  });
};

export const sendResetPasswordEmail = async ({ email, token }: ResetPasswordEmailParams) => {
  return sendSendGridEmail({
    to: email,
    subject: `Reset your ${APP_NAME} password`,
    html: getResetPasswordHtml({ email, token }),
  });
};