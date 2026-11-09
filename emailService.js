
// emailService.js – Campus Maintenance Management System Email Notification Service
// Provides real-time transactional emails for ticket creation, technician dispatch, and resolution.
// Features direct SMTP integration (Node.js TLS/Net) with automatic fallback to persistent database simulation.

const net = require('net');
const tls = require('tls');
const db = require('./db');

// SMTP Configuration from environment
const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || '',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.SMTP_FROM || 'FixPoint Campus Maintenance <maintenance@campus.edu>'
};

/**
 * Native lightweight SMTP client using Node.js sockets.
 * Connects directly to SMTP server (STARTTLS or SSL) without external npm packages.
 */
function sendViaNativeSmtp(to, subject, htmlBody, textBody) {
  return new Promise((resolve, reject) => {
    if (!SMTP_CONFIG.host || !SMTP_CONFIG.user) {
      return resolve({ simulated: true, message: 'SMTP not configured in .env. Using DB logger simulation.' });
    }

    const host = SMTP_CONFIG.host;
    const port = SMTP_CONFIG.port;
    let socket;
    let logBuffer = [];

    const sendCmd = (cmd) => {
      socket.write(cmd + '\r\n');
    };

    const cleanup = () => {
      if (socket && !socket.destroyed) socket.destroy();
    };

    const onData = (data) => {
      const msg = data.toString();
      logBuffer.push(msg);

      if (msg.startsWith('220')) {
        sendCmd(`EHLO ${host}`);
      } else if (msg.startsWith('250-') || msg.startsWith('250 ')) {
        if (!socket._authed) {
          if (!SMTP_CONFIG.secure && port === 587 && !socket._upgraded) {
            socket._upgraded = true;
            sendCmd('STARTTLS');
          } else {
            socket._authed = true;
            sendCmd('AUTH LOGIN');
          }
        } else if (socket._mailFromSent && !socket._rcptToSent) {
          socket._rcptToSent = true;
          sendCmd(`RCPT TO:<${to}>`);
        } else if (socket._rcptToSent && !socket._dataSent) {
          socket._dataSent = true;
          sendCmd('DATA');
        } else if (socket._bodySent) {
          sendCmd('QUIT');
          resolve({ simulated: false, message: 'Delivered via SMTP' });
          cleanup();
        }
      } else if (msg.startsWith('220 2.0.0 Ready to start TLS')) {
        socket = tls.connect({ socket, host }, () => {
          socket.on('data', onData);
          sendCmd(`EHLO ${host}`);
        });
      } else if (msg.startsWith('334')) {
        if (!socket._userSent) {
          socket._userSent = true;
          sendCmd(Buffer.from(SMTP_CONFIG.user).toString('base64'));
        } else {
          sendCmd(Buffer.from(SMTP_CONFIG.pass).toString('base64'));
        }
      } else if (msg.startsWith('235')) {
        socket._mailFromSent = true;
        const fromAddr = (SMTP_CONFIG.from.match(/<([^>]+)>/) || [null, SMTP_CONFIG.user])[1];
        sendCmd(`MAIL FROM:<${fromAddr}>`);
      } else if (msg.startsWith('354')) {
        socket._bodySent = true;
        const rawMsg = [
          `From: ${SMTP_CONFIG.from}`,
          `To: ${to}`,
          `Subject: ${subject}`,
          'MIME-Version: 1.0',
          'Content-Type: text/html; charset=UTF-8',
          '',
          htmlBody,
          '.'
        ].join('\r\n');
        sendCmd(rawMsg);
      } else if (msg.startsWith('5') || msg.startsWith('4')) {
        cleanup();
        reject(new Error(`SMTP error response: ${msg.trim()}`));
      }
    };

    if (SMTP_CONFIG.secure) {
      socket = tls.connect(port, host, { rejectUnauthorized: false }, () => {
        socket.on('data', onData);
      });
    } else {
      socket = net.connect(port, host, () => {
        socket.on('data', onData);
      });
    }

    socket.on('error', (err) => {
      cleanup();
      reject(err);
    });

    socket.setTimeout(8000, () => {
      cleanup();
      reject(new Error('SMTP connection timed out'));
    });
  });
}

/**
 * Professional, modern HTML email template wrapper.
 */
function renderEmailTemplate({ title, badgeText, badgeColor, preheader, contentHtml, actionUrl, actionText, ticketId }) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#0b1329;font-family:'Segoe UI',Roboto,-apple-system,BlinkMacSystemFont,sans-serif;color:#f0f4ff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0b1329;padding:40px 20px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#132042;border:1px solid #283a6b;border-radius:16px;overflow:hidden;box-shadow:0 12px 36px rgba(0,0,0,0.4);">
          <!-- Header Bar -->
          <tr>
            <td style="padding:28px 36px;background:linear-gradient(135deg,#162752 0%,#0e1936 100%);border-bottom:1px solid #23345e;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Fix<span style="color:#60a5fa;">Point</span></span>
                    <span style="font-size:12px;color:#94a3b8;margin-left:10px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Campus Maintenance</span>
                  </td>
                  <td align="right">
                    <span style="display:inline-block;padding:5px 12px;border-radius:20px;font-size:11px;font-weight:700;background-color:${badgeColor || '#3b82f6'};color:#ffffff;text-transform:uppercase;letter-spacing:0.5px;">
                      ${badgeText || 'Notification'}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px;line-height:1.65;font-size:15px;color:#cbd5e1;">
              <h1 style="margin:0 0 16px 0;font-size:21px;font-weight:700;color:#ffffff;">${title}</h1>
              <p style="margin:0 0 22px 0;color:#94a3b8;font-size:14px;">${preheader || ''}</p>
              
              <div style="background-color:#0d162e;border:1px solid #23345e;border-radius:12px;padding:22px;margin:20px 0;">
                ${contentHtml}
              </div>

              ${actionText ? `
              <div style="text-align:center;margin:32px 0 16px 0;">
                <a href="${actionUrl || 'http://localhost:3000'}" style="display:inline-block;padding:12px 28px;background-color:#3b82f6;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:700;box-shadow:0 4px 14px rgba(59,130,246,0.35);">
                  ${actionText} &rarr;
                </a>
              </div>
              ` : ''}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:22px 36px;background-color:#0d162e;border-top:1px solid #1f2f55;font-size:12px;color:#64748b;text-align:center;">
              <p style="margin:0 0 6px 0;">This is an automated notification from the FixPoint Campus Maintenance Management System.</p>
              <p style="margin:0;">Ref Ticket: #${ticketId || 'N/A'} | &copy; ${new Date().getFullYear()} Campus Facilities Services</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Log and send email.
 */
async function dispatchEmail({ toEmail, toUsername, subject, eventType, requestId, title, badgeText, badgeColor, preheader, contentHtml, actionUrl, actionText }) {
  const html = renderEmailTemplate({
    title,
    badgeText,
    badgeColor,
    preheader,
    contentHtml,
    actionUrl,
    actionText,
    ticketId: requestId
  });

  let deliveryStatus = 'Simulated';
  let errorMsg = null;

  try {
    const res = await sendViaNativeSmtp(toEmail, subject, html, preheader);
    if (!res.simulated) {
      deliveryStatus = 'Sent';
    }
  } catch (err) {
    console.warn(`[EmailService] SMTP delivery failed, falling back to database simulation: ${err.message}`);
    deliveryStatus = 'Simulated';
    errorMsg = err.message;
  }

  // Persist to MySQL email_logs table
  try {
    await db.query(
      `INSERT INTO email_logs (recipient, recipient_user, subject, body, event_type, request_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [toEmail, toUsername || null, subject, html, eventType, requestId || null, deliveryStatus]
    );
  } catch (dbErr) {
    console.error('[EmailService] Failed to save email log to DB:', dbErr.message);
  }

  console.log(`📨 [EmailService] ${deliveryStatus.toUpperCase()} [${eventType}] To: ${toEmail} | Subject: "${subject}"`);
  return { ok: true, status: deliveryStatus, toEmail, subject };
}

/**
 * 1. Ticket Created Email:
 * Dispatches confirmation to requester + new ticket alert to administrator.
 */
async function sendTicketCreatedEmail(ticket, requesterUser) {
  const requesterEmail = requesterUser.email || `${requesterUser.username}@campus.edu`;

  // 1a. Confirmation to Requester
  await dispatchEmail({
    toEmail: requesterEmail,
    toUsername: requesterUser.username,
    subject: `Ticket #${ticket.id} Logged: ${ticket.title}`,
    eventType: 'ticket_created',
    requestId: ticket.id,
    title: 'Your Maintenance Request Has Been Received',
    badgeText: 'Ticket Logged',
    badgeColor: '#3b82f6',
    preheader: `Thank you for reporting this issue. Our campus facilities team has received your ticket and will dispatch maintenance personnel.`,
    contentHtml: `
      <p style="margin:0 0 10px 0;"><strong style="color:#ffffff;">Ticket ID:</strong> #${ticket.id}</p>
      <p style="margin:0 0 10px 0;"><strong style="color:#ffffff;">Title:</strong> ${ticket.title}</p>
      <p style="margin:0 0 10px 0;"><strong style="color:#ffffff;">Category:</strong> <span style="color:#60a5fa;">${ticket.category || 'General'}</span></p>
      <p style="margin:0 0 10px 0;"><strong style="color:#ffffff;">Location:</strong> ${ticket.location || 'Campus'}</p>
      <p style="margin:0 0 10px 0;"><strong style="color:#ffffff;">Priority:</strong> <span style="color:${ticket.priority === 'High' ? '#f87171' : ticket.priority === 'Medium' ? '#fbbf24' : '#34d399'};font-weight:700;">${ticket.priority || 'Medium'}</span></p>
      <p style="margin:0;"><strong style="color:#ffffff;">Description:</strong> ${ticket.description || 'No additional details provided.'}</p>
    `,
    actionUrl: `http://localhost:3000/${requesterUser.role === 'faculty' ? 'faculty.html' : 'student.html'}`,
    actionText: 'View Ticket Progress'
  });

  // 1b. Alert to Admin
  await dispatchEmail({
    toEmail: 'admin@campus.edu',
    toUsername: 'admin',
    subject: `[New Ticket Alert] #${ticket.id} - ${ticket.title} (${ticket.location})`,
    eventType: 'ticket_created',
    requestId: ticket.id,
    title: 'New Campus Maintenance Ticket Submitted',
    badgeText: 'Needs Assignment',
    badgeColor: '#f59e0b',
    preheader: `A new ticket has been submitted by ${requesterUser.name} (${requesterUser.username}) requiring staff assignment.`,
    contentHtml: `
      <p style="margin:0 0 10px 0;"><strong style="color:#ffffff;">Ticket ID:</strong> #${ticket.id}</p>
      <p style="margin:0 0 10px 0;"><strong style="color:#ffffff;">Requester:</strong> ${requesterUser.name} (${requesterUser.role})</p>
      <p style="margin:0 0 10px 0;"><strong style="color:#ffffff;">Location:</strong> ${ticket.location}</p>
      <p style="margin:0 0 10px 0;"><strong style="color:#ffffff;">Priority:</strong> ${ticket.priority}</p>
      <p style="margin:0;"><strong style="color:#ffffff;">Summary:</strong> ${ticket.title}</p>
    `,
    actionUrl: 'http://localhost:3000/admin.html',
    actionText: 'Open Admin Dispatcher'
  });
}

/**
 * 2. Ticket Assigned Email:
 * Dispatches work order details to assigned maintenance technician.
 */
async function sendTicketAssignedEmail(ticket, technicianUser) {
  const staffEmail = technicianUser.email || `${technicianUser.username}@campus.edu`;

  await dispatchEmail({
    toEmail: staffEmail,
    toUsername: technicianUser.username,
    subject: `[Work Order Assigned] Ticket #${ticket.id}: ${ticket.title}`,
    eventType: 'ticket_assigned',
    requestId: ticket.id,
    title: 'New Work Order Assigned to You',
    badgeText: 'Work Order',
    badgeColor: '#8b5cf6',
    preheader: `Campus administration has assigned ticket #${ticket.id} to your maintenance queue.`,
    contentHtml: `
      <p style="margin:0 0 10px 0;"><strong style="color:#ffffff;">Work Order:</strong> #${ticket.id}</p>
      <p style="margin:0 0 10px 0;"><strong style="color:#ffffff;">Issue Title:</strong> ${ticket.title}</p>
      <p style="margin:0 0 10px 0;"><strong style="color:#ffffff;">Location:</strong> <span style="color:#34d399;font-weight:700;">${ticket.location}</span></p>
      <p style="margin:0 0 10px 0;"><strong style="color:#ffffff;">Category:</strong> ${ticket.category}</p>
      <p style="margin:0 0 10px 0;"><strong style="color:#ffffff;">Priority:</strong> <span style="color:${ticket.priority === 'High' ? '#f87171' : '#fbbf24'};font-weight:700;">${ticket.priority}</span></p>
      <p style="margin:0 0 10px 0;"><strong style="color:#ffffff;">Requester:</strong> ${ticket.requester}</p>
      <p style="margin:0;"><strong style="color:#ffffff;">Details:</strong> ${ticket.description || 'Inspect site for repair.'}</p>
    `,
    actionUrl: 'http://localhost:3000/maintenance.html',
    actionText: 'Update Ticket Status'
  });
}

/**
 * 3. Ticket Resolved Email:
 * Dispatches closure notification to the original student or faculty requester.
 */
async function sendTicketResolvedEmail(ticket, requesterUser) {
  const requesterEmail = requesterUser.email || `${requesterUser.username}@campus.edu`;

  await dispatchEmail({
    toEmail: requesterEmail,
    toUsername: requesterUser.username,
    subject: `[Resolved] Ticket #${ticket.id}: ${ticket.title} is now Closed`,
    eventType: 'ticket_resolved',
    requestId: ticket.id,
    title: 'Your Maintenance Issue Has Been Resolved',
    badgeText: 'Resolved & Closed',
    badgeColor: '#10b981',
    preheader: `Good news! Maintenance technician has inspected and completed the repair work for ticket #${ticket.id}.`,
    contentHtml: `
      <p style="margin:0 0 10px 0;"><strong style="color:#ffffff;">Ticket ID:</strong> #${ticket.id}</p>
      <p style="margin:0 0 10px 0;"><strong style="color:#ffffff;">Title:</strong> ${ticket.title}</p>
      <p style="margin:0 0 10px 0;"><strong style="color:#ffffff;">Location:</strong> ${ticket.location}</p>
      <p style="margin:0 0 10px 0;"><strong style="color:#ffffff;">Resolved By:</strong> ${ticket.assigned_to || 'Facilities Team'}</p>
      <p style="margin:0;"><strong style="color:#ffffff;">Status:</strong> <span style="color:#34d399;font-weight:700;">Closed (Work Completed)</span></p>
    `,
    actionUrl: `http://localhost:3000/${requesterUser.role === 'faculty' ? 'faculty.html' : 'student.html'}`,
    actionText: 'Check Ticket Details'
  });
}

/**
 * 4. Test Email:
 * Sends an immediate diagnostic verification email to any user account.
 */
async function sendTestEmail(user) {
  const email = user.email || `${user.username}@campus.edu`;

  return await dispatchEmail({
    toEmail: email,
    toUsername: user.username,
    subject: `[FixPoint Test] Email Service Verification for ${user.name}`,
    eventType: 'test',
    requestId: null,
    title: 'FixPoint Email Notification Service Active',
    badgeText: 'System Test',
    badgeColor: '#06b6d4',
    preheader: `Diagnostic test message confirming that your account is receiving real-time campus maintenance alerts.`,
    contentHtml: `
      <p style="margin:0 0 10px 0;"><strong style="color:#ffffff;">Account Name:</strong> ${user.name}</p>
      <p style="margin:0 0 10px 0;"><strong style="color:#ffffff;">Role:</strong> <span style="text-transform:capitalize;color:#60a5fa;">${user.role}</span></p>
      <p style="margin:0 0 10px 0;"><strong style="color:#ffffff;">Registered Email:</strong> ${email}</p>
      <p style="margin:0 0 10px 0;"><strong style="color:#ffffff;">Timestamp:</strong> ${new Date().toLocaleString()}</p>
      <p style="margin:0;"><strong style="color:#ffffff;">Status:</strong> <span style="color:#34d399;font-weight:700;">Operational & Ready</span></p>
    `,
    actionUrl: 'http://localhost:3000',
    actionText: 'Return to Dashboard'
  });
}

module.exports = {
  dispatchEmail,
  sendTicketCreatedEmail,
  sendTicketAssignedEmail,
  sendTicketResolvedEmail,
  sendTestEmail
};
