const test = require("node:test");
const assert = require("node:assert/strict");

const { createEmailService, buildSmtpConfig } = require("../services/email-service");
const { AppError } = require("../lib/app-error");

test("smtp mode sends password reset email through the configured transport", async function() {
    let capturedConfig = null;
    let capturedMessage = null;

    const emailService = createEmailService({
        mode: "smtp",
        fromEmail: "no-reply@example.com",
        smtp: {
            host: "smtp.example.com",
            port: "587",
            secure: "false",
            user: "mailer@example.com",
            pass: "secret"
        },
        transportFactory: function(config) {
            capturedConfig = config;
            return {
                sendMail: async function(message) {
                    capturedMessage = message;
                    return {
                        messageId: "message-123"
                    };
                }
            };
        }
    });

    const result = await emailService.sendPasswordResetEmail({
        to: "reset-user@example.com",
        fullName: "Reset User",
        resetUrl: "https://example.com/reset?token=abc",
        expiresAt: "2026-07-07T12:00:00.000Z"
    });

    assert.deepEqual(capturedConfig, {
        host: "smtp.example.com",
        port: 587,
        secure: false,
        auth: {
            user: "mailer@example.com",
            pass: "secret"
        }
    });
    assert.equal(capturedMessage.to, "reset-user@example.com");
    assert.equal(capturedMessage.from, "no-reply@example.com");
    assert.match(capturedMessage.text, /Reset link: https:\/\/example.com\/reset\?token=abc/);
    assert.equal(result.delivered, true);
    assert.equal(result.mode, "smtp");
    assert.equal(result.preview, null);
    assert.equal(result.messageId, "message-123");
});

test("smtp mode sends verification email through the configured transport", async function() {
    let capturedMessage = null;

    const emailService = createEmailService({
        mode: "smtp",
        fromEmail: "no-reply@example.com",
        smtp: {
            host: "smtp.example.com",
            port: "587",
            secure: "false"
        },
        transportFactory: function() {
            return {
                sendMail: async function(message) {
                    capturedMessage = message;
                    return {
                        messageId: "message-verify-123"
                    };
                }
            };
        }
    });

    const result = await emailService.sendEmailVerificationEmail({
        to: "verify-user@example.com",
        fullName: "Verify User",
        verificationUrl: "https://example.com/verify?token=abc",
        expiresAt: "2026-07-07T12:00:00.000Z"
    });

    assert.equal(capturedMessage.to, "verify-user@example.com");
    assert.equal(capturedMessage.from, "no-reply@example.com");
    assert.match(capturedMessage.text, /Verify your email: https:\/\/example.com\/verify\?token=abc/);
    assert.equal(result.delivered, true);
    assert.equal(result.mode, "smtp");
    assert.equal(result.messageId, "message-verify-123");
});

test("smtp config validation rejects missing host", function() {
    assert.throws(function() {
        buildSmtpConfig({
            host: "",
            port: "587"
        });
    }, function(error) {
        assert.equal(error instanceof AppError, true);
        assert.equal(error.message, "SMTP_HOST must be configured when EMAIL_MODE is smtp.");
        return true;
    });
});
