const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const { AppError } = require("../lib/app-error");

function createEmailService(options) {
    const mode = options.mode || "dev-log";
    const outboxDir = options.outboxDir ? path.resolve(options.outboxDir) : null;
    const fromEmail = options.fromEmail || "no-reply@lifetimelinetracker.local";
    const smtp = options.smtp || {};
    const transportFactory = options.transportFactory || nodemailer.createTransport;
    let transport;

    async function sendPasswordResetEmail(payload) {
        return sendMessage({
            to: payload.to,
            previewLink: payload.resetUrl,
            subject: "Reset your Life Timeline Tracker password",
            text: [
                `Hello ${payload.fullName || "there"},`,
                "",
                "A password reset was requested for your account.",
                `Reset link: ${payload.resetUrl}`,
                `This link expires at: ${payload.expiresAt}`,
                "",
                "If you did not request this, you can ignore this message."
            ].join("\n")
        });
    }

    async function sendEmailVerificationEmail(payload) {
        return sendMessage({
            to: payload.to,
            previewLink: payload.verificationUrl,
            subject: "Verify your Life Timeline Tracker email",
            text: [
                `Hello ${payload.fullName || "there"},`,
                "",
                "Welcome to Life Timeline Tracker.",
                `Verify your email: ${payload.verificationUrl}`,
                `This link expires at: ${payload.expiresAt}`,
                "",
                "If you did not create this account, you can ignore this message."
            ].join("\n")
        });
    }

    async function sendMessage(payload) {
        const message = {
            to: payload.to,
            from: fromEmail,
            subject: payload.subject,
            text: payload.text
        };

        if (mode === "disabled") {
            return {
                delivered: false,
                mode,
                preview: null
            };
        }

        if (mode === "dev-log") {
            fs.mkdirSync(outboxDir, { recursive: true });
            const fileName = `${Date.now()}-${sanitizeFileName(payload.to)}.json`;
            const filePath = path.join(outboxDir, fileName);
            fs.writeFileSync(filePath, JSON.stringify(message, null, 2));
            return {
                delivered: true,
                mode,
                preview: {
                    filePath,
                    url: payload.previewLink
                }
            };
        }

        if (mode === "smtp") {
            const smtpConfig = buildSmtpConfig(smtp);
            if (!transport) {
                transport = transportFactory(smtpConfig);
            }

            const info = await transport.sendMail(message);
            return {
                delivered: true,
                mode,
                preview: null,
                messageId: info && info.messageId ? info.messageId : null
            };
        }

        return {
            delivered: false,
            mode,
            preview: null
        };
    }

    return {
        sendPasswordResetEmail,
        sendEmailVerificationEmail
    };
}

function sanitizeFileName(value) {
    return String(value || "")
        .replace(/[^a-zA-Z0-9._-]/g, "-")
        .slice(0, 120);
}

function buildSmtpConfig(smtp) {
    if (!smtp.host) {
        throw new AppError(500, "SMTP_HOST must be configured when EMAIL_MODE is smtp.");
    }

    const port = Number(smtp.port);
    if (!Number.isFinite(port) || port <= 0) {
        throw new AppError(500, "SMTP_PORT must be a valid positive number when EMAIL_MODE is smtp.");
    }

    const config = {
        host: smtp.host,
        port,
        secure: resolveSecureSetting(smtp.secure, port)
    };

    if (smtp.user) {
        config.auth = {
            user: smtp.user,
            pass: smtp.pass || ""
        };
    }

    return config;
}

function resolveSecureSetting(value, port) {
    if (typeof value === "boolean") {
        return value;
    }

    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "true") {
        return true;
    }

    if (normalized === "false") {
        return false;
    }

    return port === 465;
}

module.exports = {
    createEmailService,
    buildSmtpConfig
};
