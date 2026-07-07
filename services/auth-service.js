const crypto = require("crypto");
const { AppError } = require("../lib/app-error");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function createAuthService(options) {
    const store = options.store;
    const createSampleRecords = options.createSampleRecords;
    const passwordResetTtlMinutes = options.passwordResetTtlMinutes || 60;
    const emailVerificationTtlHours = options.emailVerificationTtlHours || 24;
    const exposeResetToken = Boolean(options.exposeResetToken);
    const exposeVerificationToken = Boolean(options.exposeVerificationToken);
    const emailService = options.emailService;
    const appBaseUrl = options.appBaseUrl || "http://127.0.0.1:4173";

    async function signup(body) {
        const fullName = normalizeTextField(body.fullName, 80);
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");

        if (!fullName || !email || !password) {
            throw new AppError(400, "Full name, email, and password are required.");
        }

        if (!emailPattern.test(email)) {
            throw new AppError(400, "Enter a valid email address.");
        }

        if (password.length < 8) {
            throw new AppError(400, "Password must be at least 8 characters long.");
        }

        const existing = store.findUserByEmail(email);
        if (existing) {
            throw new AppError(409, "An account with this email already exists.");
        }

        const verificationToken = crypto.randomBytes(24).toString("hex");
        const verificationTokenHash = hashVerificationToken(verificationToken);
        const verificationExpiresAt = new Date(Date.now() + emailVerificationTtlHours * 60 * 60 * 1000).toISOString();
        const verificationUrl = `${appBaseUrl}/#auth-verify?token=${encodeURIComponent(verificationToken)}`;

        const user = {
            id: createId("user"),
            fullName,
            email,
            passwordHash: hashPassword(password),
            createdAt: new Date().toISOString(),
            emailVerifiedAt: null,
            emailVerificationTokenHash: verificationTokenHash,
            emailVerificationTokenExpiresAt: verificationExpiresAt,
            records: createSampleRecords()
        };

        store.createUser(user);

        const response = {
            message: "Account created. Verify your email before logging in."
        };

        const emailResult = await sendVerificationEmail(user, verificationUrl, verificationExpiresAt);

        if (exposeVerificationToken) {
            response.verificationToken = verificationToken;
            response.verificationUrl = verificationUrl;
            response.expiresAt = verificationExpiresAt;
        }

        if (emailResult) {
            response.delivery = {
                mode: emailResult.mode,
                delivered: emailResult.delivered,
                preview: emailResult.preview || null
            };
        }

        return response;
    }

    function login(body) {
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");

        if (!email || !password) {
            throw new AppError(400, "Email and password are required.");
        }

        const user = store.findUserByEmail(email);
        if (!user || !verifyPassword(password, user.passwordHash)) {
            throw new AppError(401, "Invalid email or password.");
        }

        if (!user.emailVerifiedAt) {
            throw new AppError(403, "Verify your email before logging in.");
        }

        return user;
    }

    function getUserById(userId) {
        return store.findUserById(userId);
    }

    async function verifyEmail(body) {
        const token = String(body.token || "").trim();
        if (!token) {
            throw new AppError(400, "Verification token is required.");
        }

        const user = store.findUserByEmailVerificationToken(hashVerificationToken(token), new Date().toISOString());
        if (!user) {
            throw new AppError(400, "Verification token is invalid or expired.");
        }

        store.markUserEmailVerified(user.id, new Date().toISOString());
        return {
            message: "Email verified successfully. You can log in now."
        };
    }

    async function resendVerification(body) {
        const email = String(body.email || "").trim().toLowerCase();
        if (!email) {
            throw new AppError(400, "Email is required.");
        }

        const user = store.findUserByEmail(email);
        if (!user || user.emailVerifiedAt) {
            return {
                message: "If an unverified account exists for that email, a verification link has been created."
            };
        }

        const verificationToken = crypto.randomBytes(24).toString("hex");
        const verificationTokenHash = hashVerificationToken(verificationToken);
        const verificationExpiresAt = new Date(Date.now() + emailVerificationTtlHours * 60 * 60 * 1000).toISOString();
        const verificationUrl = `${appBaseUrl}/#auth-verify?token=${encodeURIComponent(verificationToken)}`;
        store.saveEmailVerificationToken(user.id, verificationTokenHash, verificationExpiresAt);

        const response = {
            message: "If an unverified account exists for that email, a verification link has been created."
        };

        const emailResult = await sendVerificationEmail(user, verificationUrl, verificationExpiresAt);

        if (exposeVerificationToken) {
            response.verificationToken = verificationToken;
            response.verificationUrl = verificationUrl;
            response.expiresAt = verificationExpiresAt;
        }

        if (emailResult) {
            response.delivery = {
                mode: emailResult.mode,
                delivered: emailResult.delivered,
                preview: emailResult.preview || null
            };
        }

        return response;
    }

    async function requestPasswordReset(body) {
        const email = String(body.email || "").trim().toLowerCase();
        if (!email) {
            throw new AppError(400, "Email is required.");
        }

        const user = store.findUserByEmail(email);
        if (!user) {
            return {
                message: "If an account exists for that email, a password reset token has been created."
            };
        }

        const resetToken = crypto.randomBytes(24).toString("hex");
        const resetTokenHash = hashResetToken(resetToken);
        const expiresAt = new Date(Date.now() + passwordResetTtlMinutes * 60 * 1000).toISOString();
        const resetUrl = `${appBaseUrl}/#auth-reset?token=${encodeURIComponent(resetToken)}`;
        store.savePasswordResetToken(user.id, resetTokenHash, expiresAt);

        let emailResult = null;
        if (emailService) {
            try {
                emailResult = await emailService.sendPasswordResetEmail({
                    to: user.email,
                    fullName: user.fullName,
                    resetUrl,
                    expiresAt
                });
            } catch (error) {
                if (error instanceof AppError) {
                    throw error;
                }

                throw new AppError(502, "Password reset email could not be delivered.");
            }
        }

        const response = {
            message: "If an account exists for that email, a password reset link has been created."
        };

        if (exposeResetToken) {
            response.resetToken = resetToken;
            response.expiresAt = expiresAt;
            response.resetUrl = resetUrl;
        }

        if (emailResult) {
            response.delivery = {
                mode: emailResult.mode,
                delivered: emailResult.delivered,
                preview: emailResult.preview || null
            };
        }

        return response;
    }

    function resetPassword(body) {
        const token = String(body.token || "").trim();
        const newPassword = String(body.newPassword || "");

        if (!token || !newPassword) {
            throw new AppError(400, "Reset token and new password are required.");
        }

        if (newPassword.length < 8) {
            throw new AppError(400, "Password must be at least 8 characters long.");
        }

        const user = store.findUserByResetToken(hashResetToken(token), new Date().toISOString());
        if (!user) {
            throw new AppError(400, "Reset token is invalid or expired.");
        }

        store.updateUserPassword(user.id, hashPassword(newPassword));
        return {
            message: "Password updated successfully."
        };
    }

    async function sendVerificationEmail(user, verificationUrl, expiresAt) {
        if (!emailService || typeof emailService.sendEmailVerificationEmail !== "function") {
            return null;
        }

        try {
            return await emailService.sendEmailVerificationEmail({
                to: user.email,
                fullName: user.fullName,
                verificationUrl,
                expiresAt
            });
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            throw new AppError(502, "Verification email could not be delivered.");
        }
    }

    return {
        signup,
        login,
        getUserById,
        verifyEmail,
        resendVerification,
        requestPasswordReset,
        resetPassword
    };
}

function createId(prefix) {
    return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
    return `${salt}:${hash}`;
}

function verifyPassword(password, storedValue) {
    const parts = String(storedValue || "").split(":");
    if (parts.length !== 2) {
        return false;
    }

    const salt = parts[0];
    const originalHash = parts[1];
    const incomingHash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
    return crypto.timingSafeEqual(Buffer.from(originalHash, "hex"), Buffer.from(incomingHash, "hex"));
}

function normalizeTextField(value, maxLength) {
    return String(value || "").trim().slice(0, maxLength);
}

function hashResetToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

function hashVerificationToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = {
    createAuthService
};
