import nodemailer from 'nodemailer';
import axios from 'axios';
import dotenv from 'dotenv';
import { validateMonitorUrl } from '../utils/url-validator.js';

// Ensure .env variables are available even if this file is imported before server bootstrap
dotenv.config();

class NotificationService {
  constructor() {
    // Initialize email transporter
    const smtpUrl = process.env.SMTP_URL || process.env.EMAIL_SMTP_URL || null;
    // Support alternative Brevo env var names the user provided
    const host = process.env.EMAIL_HOST || process.env.SMTP_SERVER || null;
    const port = process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT, 10) : (process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : null);

    // Support alternative sender/login env names (Brevo examples)
    const emailUser = process.env.EMAIL_USER || process.env.EMAIL_SENDER_USERNAME || process.env.EMAIL_SENDER || null;
    const emailPass = process.env.EMAIL_PASSWORD || process.env.EMAIL_SMTP_KEY || null;
    // Map EMAIL_FROM from provided sender address if present
    if (process.env.EMAIL_SENDER_ADDRESS && !process.env.EMAIL_FROM) {
      process.env.EMAIL_FROM = process.env.EMAIL_SENDER_ADDRESS;
    }

    // If BREVO_API_KEY is present, prefer Brevo REST API for sending
    if (process.env.BREVO_API_KEY) {
      console.log('ℹ️  BREVO_API_KEY detected — using Brevo (Sendinblue) REST API for email delivery');
      this.emailTransporter = null;
      return;
    }

    if (!emailUser || !emailPass) {
      console.warn('⚠️  Email credentials missing. Set EMAIL_USER/EMAIL_SENDER_USERNAME and EMAIL_PASSWORD (or EMAIL_SMTP_KEY), or set BREVO_API_KEY to enable alerts.');
      this.emailTransporter = null;
      return;
    }

    // Build transporter from SMTP_URL or individual env vars
    try {
      const pool = (process.env.EMAIL_POOL || 'false').toLowerCase() === 'true';
      const maxConnections = process.env.EMAIL_MAX_CONNECTIONS ? parseInt(process.env.EMAIL_MAX_CONNECTIONS, 10) : undefined;
      const connectionTimeout = process.env.EMAIL_CONN_TIMEOUT ? parseInt(process.env.EMAIL_CONN_TIMEOUT, 10) : 10000; // ms
      const greetingTimeout = process.env.EMAIL_GREETING_TIMEOUT ? parseInt(process.env.EMAIL_GREETING_TIMEOUT, 10) : 10000; // ms
      const socketTimeout = process.env.EMAIL_SOCKET_TIMEOUT ? parseInt(process.env.EMAIL_SOCKET_TIMEOUT, 10) : 120000; // ms
      const tlsReject = (process.env.EMAIL_TLS_REJECT_UNAUTHORIZED || 'false').toLowerCase() === 'true';

      if (!smtpUrl && !(emailUser && emailPass && host && port)) {
        console.warn('⚠️  Email configuration incomplete. Set SMTP_URL or SMTP_SERVER/SMTP_PORT/EMAIL_SENDER_USERNAME/EMAIL_PASSWORD to enable alerts.');
        this.emailTransporter = null;
        return;
      }

      let transportOptions = {
        pool: pool || undefined,
        maxConnections,
        connectionTimeout,
        greetingTimeout,
        socketTimeout,
        logger: (process.env.NODE_ENV !== 'production'),
        debug: (process.env.NODE_ENV !== 'production')
      };

      if (smtpUrl) {
        const url = new URL(smtpUrl);
        const urlPort = url.port ? parseInt(url.port, 10) : (url.protocol === 'smtps:' ? 465 : 587);
        transportOptions = {
          ...transportOptions,
          host: url.hostname,
          port: urlPort,
          secure: url.protocol === 'smtps:',
          requireTLS: true,
          auth: url.username ? { user: decodeURIComponent(url.username), pass: decodeURIComponent(url.password) } : undefined,
          tls: { rejectUnauthorized: tlsReject }
        };
      } else {
        transportOptions = {
          ...transportOptions,
          host,
          port,
          secure: port === 465,
          requireTLS: true,
          auth: {
            user: emailUser,
            pass: emailPass
          },
          tls: { rejectUnauthorized: tlsReject }
        };
      }

      this.emailTransporter = nodemailer.createTransport(transportOptions);
      // Verify connection in background and log outcome, but skip in test mode to prevent open handles
      if (process.env.NODE_ENV !== 'test') {
        this.verifyTransporter().then(result => {
          if (result.success) {
            console.log('✅ Email transporter verified');
          } else {
            console.warn('⚠️ Email transporter verification failed:', result.error);
          }
        });
      }
    } catch (err) {
      console.error('Failed to create email transporter:', err.message || err);
      this.emailTransporter = null;
    }
  }

  // Send email notification
  async sendEmail(to, subject, html) {
    try {
      // If a Brevo API key is configured, use Brevo's REST API
      if (process.env.BREVO_API_KEY) {
        return await this.sendViaBrevo(to, subject, html);
      }

      if (!this.emailTransporter) {
        console.warn('Email transporter not configured. Skipping email send.');
        return { success: true, skipped: true };
      }

      const mailOptions = {
        from: process.env.EMAIL_FROM || 'PulseGuard <no-reply@uptime-checker.dev>',
        to,
        subject,
        html
      };

      const maxRetries = 3;
      let lastError;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const info = await this.emailTransporter.sendMail(mailOptions);
          return { success: true, messageId: info && info.messageId ? info.messageId : undefined };
        } catch (err) {
          lastError = err;
          console.warn(`⚠️ Email send attempt ${attempt} failed: ${err.message}. Retrying...`);
          if (attempt < maxRetries) await new Promise(res => setTimeout(res, 1000 * attempt));
        }
      }
      throw lastError;
    } catch (error) {
      console.error('Email notification error:', error && error.message ? error.message : error);
      return { success: false, error: error && error.message ? error.message : String(error) };
    }
  }

  // Send via Brevo (Sendinblue) REST API with Retry Logic
  async sendViaBrevo(to, subject, html) {
    let lastError;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!process.env.BREVO_API_KEY) {
          return { success: false, error: 'brevo-api-key-missing' };
        }

        // Normalize recipients into [{ email, name? }]
        let recipients = [];
        if (!to) {
          return { success: false, error: 'no-recipient' };
        }

        if (Array.isArray(to)) {
          recipients = to.map(t => (typeof t === 'string' ? { email: t } : t));
        } else if (typeof to === 'string') {
          recipients = to.split(',').map(s => ({ email: s.trim() }));
        } else if (typeof to === 'object' && to.email) {
          recipients = [to];
        }

        const senderEmail = (process.env.EMAIL_FROM && process.env.EMAIL_FROM.includes('<'))
          ? process.env.EMAIL_FROM.replace(/.*<([^>]+)>/, '$1').trim()
          : (process.env.EMAIL_FROM_EMAIL || (process.env.EMAIL_FROM && process.env.EMAIL_FROM) || 'no-reply@uptime-checker.dev');
        const senderName = process.env.EMAIL_FROM_NAME || (process.env.EMAIL_FROM && process.env.EMAIL_FROM.replace(/<.*>/, '').trim()) || 'PulseGuard';

        const body = {
          sender: { name: senderName, email: senderEmail },
          to: recipients,
          subject,
          htmlContent: html
        };

        const res = await axios.post('https://api.brevo.com/v3/smtp/email', body, {
          headers: {
            'api-key': process.env.BREVO_API_KEY,
            'Content-Type': 'application/json'
          },
          timeout: 15000 // Increased timeout for API reliability
        });

        // Brevo typically responds with an object including messageId
        const data = res && res.data ? res.data : null;
        const messageId = data && (data.messageId || data['messageId']) ? data.messageId || data['messageId'] : undefined;
        return { success: true, messageId, raw: data };
      } catch (err) {
        lastError = err;
        const statusCode = err.response?.status;
        const isRetryable = !statusCode || (statusCode >= 500 && statusCode <= 599) || statusCode === 429 || err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT';

        if (!isRetryable || attempt === maxRetries) {
          break;
        }

        const backoffMs = 1000 * Math.pow(2, attempt - 1);
        console.warn(`⚠️ Brevo send attempt ${attempt} failed: ${err.message}. Retrying in ${backoffMs}ms...`);
        await new Promise(res => setTimeout(res, backoffMs));
      }
    }

    const errMsg = lastError && lastError.response && lastError.response.data ? JSON.stringify(lastError.response.data) : (lastError && lastError.message ? lastError.message : String(lastError));
    console.error('Brevo send error after retries:', errMsg);
    return { success: false, error: errMsg };
  }

  // Verify transporter connectivity and return a simple status object
  async verifyTransporter() {
    if (!this.emailTransporter) return { success: false, error: 'transporter-not-configured' };
    try {
      await this.emailTransporter.verify();
      return { success: true };
    } catch (err) {
      return { success: false, error: err && err.message ? err.message : String(err) };
    }
  }

  // SSRF Protection: Validate webhook URLs before making requests
  isValidWebhookUrl(url) {
    const { isValid, error } = validateMonitorUrl(url);
    if (!isValid && error) {
      this.lastValidationError = error;
    }
    return isValid;
  }

  // Send Slack notification
  async sendSlack(webhookUrl, message) {
    try {
      // SSRF Protection: Validate URL before making request
      if (!this.isValidWebhookUrl(webhookUrl)) {
        const reason = this.lastValidationError || 'Rejected by SSRF protection';
        console.warn(`Slack webhook URL rejected: ${webhookUrl} | Reason: ${reason}`);
        return { success: false, error: reason };
      }

      await axios.post(webhookUrl, {
        text: message.text,
        attachments: message.attachments || []
      }, { timeout: 10000 }); // Phase 5: 10s timeout to prevent event loop blockage
      return { success: true };
    } catch (error) {
      const errMsg = error.response?.data ? JSON.stringify(error.response.data) : error.message;
      console.error(`Slack notification error: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  }

  // Send SMS notification (Twilio)
  async sendSMS(phoneNumber, message) {
    try {
      // Placeholder for Twilio integration
      // const accountSid = process.env.TWILIO_ACCOUNT_SID;
      // const authToken = process.env.TWILIO_AUTH_TOKEN;
      // const client = require('twilio')(accountSid, authToken);

      // await client.messages.create({
      //   body: message,
      //   from: process.env.TWILIO_PHONE_NUMBER,
      //   to: phoneNumber
      // });

      console.log('SMS notification (not configured):', phoneNumber, message);
      return { success: true };
    } catch (error) {
      console.error('SMS notification error:', error);
      return { success: false, error: error.message || String(error) };
    }
  }

  // Send webhook notification
  async sendWebhook(url, data) {
    try {
      // SSRF Protection: Validate URL before making request
      if (!this.isValidWebhookUrl(url)) {
        const reason = this.lastValidationError || 'Rejected by SSRF protection';
        console.warn(`Webhook URL rejected: ${url} | Reason: ${reason}`);
        return { success: false, error: reason };
      }

      await axios.post(url, data, { timeout: 10000 }); // Phase 5: 10s timeout to prevent event loop blockage
      return { success: true };
    } catch (error) {
      const errMsg = error.response?.data ? JSON.stringify(error.response.data) : error.message;
      console.error(`Webhook notification error: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  }

  // Format downtime email
  getDowntimeEmailHTML(monitor, incident) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
          .alert { background: #fee; border-left: 4px solid #dc2626; padding: 15px; margin: 15px 0; }
          .details { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; }
          .label { font-weight: bold; color: #666; }
          .value { color: #333; }
          .footer { text-align: center; color: #666; margin-top: 20px; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">🚨 Monitor Alert</h1>
          </div>
          <div class="content">
            <div class="alert">
              <h2 style="margin-top: 0; color: #dc2626;">Monitor is DOWN</h2>
              <p><strong>${monitor.name}</strong> is currently experiencing downtime.</p>
            </div>
            <div class="details">
              <p><span class="label">Monitor:</span> <span class="value">${monitor.name}</span></p>
              <p><span class="label">URL:</span> <span class="value">${monitor.url}</span></p>
              <p><span class="label">Type:</span> <span class="value">${monitor.type}</span></p>
              <p><span class="label">Started:</span> <span class="value">${new Date(incident.startTime).toLocaleString()}</span></p>
              <p><span class="label">Error Type:</span> <span class="value">${incident.errorType || 'N/A'}</span></p>
              <p><span class="label">Error Message:</span> <span class="value">${incident.errorMessage || 'Unknown error'}</span></p>
            </div>
            <p>We will notify you when the service is back online.</p>
          </div>
          <div class="footer">
            <p>PulseGuard - Monitoring your services 24/7</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Format recovery email
  getRecoveryEmailHTML(monitor, incident) {
    const duration = incident.duration ? this.formatDuration(incident.duration) : 'Unknown';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
          .success { background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 15px 0; }
          .details { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; }
          .label { font-weight: bold; color: #666; }
          .value { color: #333; }
          .footer { text-align: center; color: #666; margin-top: 20px; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">✅ Monitor Recovered</h1>
          </div>
          <div class="content">
            <div class="success">
              <h2 style="margin-top: 0; color: #10b981;">Monitor is UP</h2>
              <p><strong>${monitor.name}</strong> has recovered and is now operational.</p>
            </div>
            <div class="details">
              <p><span class="label">Monitor:</span> <span class="value">${monitor.name}</span></p>
              <p><span class="label">URL:</span> <span class="value">${monitor.url}</span></p>
              <p><span class="label">Downtime Duration:</span> <span class="value">${duration}</span></p>
              <p><span class="label">Recovered:</span> <span class="value">${new Date(incident.endTime).toLocaleString()}</span></p>
            </div>
            <p>Your service is back to normal operation.</p>
          </div>
          <div class="footer">
            <p>PulseGuard - Monitoring your services 24/7</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Format duration
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  // Format degradation email
  getDegradationEmailHTML(monitor, incident) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
          .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 15px 0; }
          .details { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; }
          .label { font-weight: bold; color: #666; }
          .value { color: #333; }
          .footer { text-align: center; color: #666; margin-top: 20px; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">⚠️ Monitor Degraded</h1>
          </div>
          <div class="content">
            <div class="warning">
              <h2 style="margin-top: 0; color: #d97706;">Performance Issue Detected</h2>
              <p><strong>${monitor.name}</strong> is currently experiencing degraded performance.</p>
            </div>
            <div class="details">
              <p><span class="label">Monitor:</span> <span class="value">${monitor.name}</span></p>
              <p><span class="label">URL:</span> <span class="value">${monitor.url}</span></p>
              <p><span class="label">Status:</span> <span class="value">DEGRADED</span></p>
              <p><span class="label">Detected:</span> <span class="value">${new Date(incident.startTime).toLocaleString()}</span></p>
              <p><span class="label">Issue:</span> <span class="value">${incident.errorMessage || 'Slow response or SSL warning'}</span></p>
            </div>
            <p>We are monitoring the situation and will notify you if the service fails completely or recovers.</p>
          </div>
          <div class="footer">
            <p>PulseGuard - Monitoring your services 24/7</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Format SSL warning email
  getSslWarningEmailHTML(monitor, incident) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
          .warning { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; margin: 15px 0; }
          .details { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; }
          .label { font-weight: bold; color: #666; }
          .value { color: #333; }
          .footer { text-align: center; color: #666; margin-top: 20px; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">⚠️ SSL Certificate Warning</h1>
          </div>
          <div class="content">
            <div class="warning">
              <h2 style="margin-top: 0; color: #d97706;">Certificate Issue Detected</h2>
              <p><strong>${monitor.name}</strong> has an SSL certificate issue that requires attention.</p>
            </div>
            <div class="details">
              <p><span class="label">Monitor:</span> <span class="value">${monitor.name}</span></p>
              <p><span class="label">URL:</span> <span class="value">${monitor.url}</span></p>
              <p><span class="label">Status:</span> <span class="value">SSL WARNING</span></p>
              <p><span class="label">Detected:</span> <span class="value">${new Date(incident.startTime).toLocaleString()}</span></p>
              <p><span class="label">Issue:</span> <span class="value">${incident.errorMessage || 'Certificate Expiring or Invalid'}</span></p>
            </div>
            <p>Please check your SSL certificate configuration to prevent service disruption.</p>
          </div>
          <div class="footer">
            <p>PulseGuard - Monitoring your services 24/7</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Password reset email
  getPasswordResetEmailHTML(name, resetUrl) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #111827; background: #f3f4f6; padding: 0; margin: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 24px; }
            .card { background: #ffffff; border-radius: 16px; padding: 32px; box-shadow: 0 20px 45px rgba(15,23,42,0.08); }
            .btn { display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); color: white; border-radius: 999px; text-decoration: none; font-weight: bold; margin: 16px 0; }
            .muted { color: #6b7280; font-size: 14px; }
            .code { font-family: 'SFMono-Regular', Consolas, monospace; background: #f9fafb; padding: 12px 16px; border-radius: 8px; display: inline-block; margin-top: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="card">
              <h2>Password reset requested</h2>
              <p>Hi ${name || 'there'},</p>
              <p>We received a request to reset your PulseGuard password. Click the button below to choose a new password. This link will expire in 60 minutes.</p>
              <a class="btn" href="${resetUrl}" target="_blank" rel="noopener noreferrer">Reset password</a>
              <p class="muted">If the button doesn't work, copy and paste this URL into your browser:</p>
              <div class="code">${resetUrl}</div>
              <p class="muted" style="margin-top: 24px;">If you didn’t request this, you can safely ignore this email—your password won’t change.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  // Alert email confirmation
  getAlertEmailConfirmationHTML(monitor, alertEmail) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
          .success { background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 15px 0; }
          .details { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; }
          .label { font-weight: bold; color: #666; }
          .value { color: #333; }
          .footer { text-align: center; color: #666; margin-top: 20px; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">✅ Email Alerts Enabled</h1>
          </div>
          <div class="content">
            <div class="success">
              <h2 style="margin-top: 0; color: #10b981;">Successfully Configured</h2>
              <p>You have successfully enabled email alerts for <strong>${monitor.name}</strong>.</p>
            </div>
            <div class="details">
              <p><span class="label">Monitor:</span> <span class="value">${monitor.name}</span></p>
              <p><span class="label">URL:</span> <span class="value">${monitor.url}</span></p>
              <p><span class="label">Alert Email:</span> <span class="value">${alertEmail}</span></p>
            </div>
            <p>You will receive notifications at this email address when the monitor goes down or recovers.</p>
            <p><strong>Please check your inbox or spam folder</strong> for future alerts.</p>
          </div>
          <div class="footer">
            <p>PulseGuard - Monitoring your services 24/7</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Contact email confirmation (for Settings page contactEmails)
  getContactEmailConfirmationHTML(email) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
          .success { background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 15px 0; }
          .details { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; }
          .label { font-weight: bold; color: #666; }
          .value { color: #333; }
          .footer { text-align: center; color: #666; margin-top: 20px; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">✅ Email Alerts Enabled</h1>
          </div>
          <div class="content">
            <div class="success">
              <h2 style="margin-top: 0; color: #10b981;">Successfully Configured</h2>
              <p>You have successfully added <strong>${email}</strong> to your contact emails.</p>
            </div>
            <div class="details">
              <p><span class="label">Contact Email:</span> <span class="value">${email}</span></p>
            </div>
            <p>You will receive notifications at this email address when your monitors go down or recover.</p>
            <p><strong>Please check your inbox or spam folder</strong> for future alerts.</p>
          </div>
          <div class="footer">
            <p>PulseGuard - Monitoring your services 24/7</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Contact email removal (for Settings page contactEmails)
  getContactEmailRemovalHTML(email) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
          .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 15px 0; }
          .details { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; }
          .label { font-weight: bold; color: #666; }
          .value { color: #333; }
          .footer { text-align: center; color: #666; margin-top: 20px; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">📧 Email Alerts Disabled</h1>
          </div>
          <div class="content">
            <div class="warning">
              <h2 style="margin-top: 0; color: #d97706;">Email Removed</h2>
              <p>You have successfully removed <strong>${email}</strong> from your contact emails.</p>
            </div>
            <div class="details">
              <p><span class="label">Removed Email:</span> <span class="value">${email}</span></p>
            </div>
            <p>You will no longer receive notifications at this email address.</p>
            <p>If you want to receive alerts again, you can add this email back in your Settings.</p>
          </div>
          <div class="footer">
            <p>PulseGuard - Monitoring your services 24/7</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

export default new NotificationService();
