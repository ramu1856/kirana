const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { AppError } = require("./lib/app-error");
const { createRateLimiter } = require("./lib/rate-limiter");
const { createSqliteStore } = require("./lib/sqlite-store");
const { createAuthService } = require("./services/auth-service");
const { createRecordService } = require("./services/record-service");
const { createEmailService } = require("./services/email-service");
const { createUploadService } = require("./services/upload-service");

const host = process.env.HOST && process.env.HOST !== "127.0.0.1"
    ? process.env.HOST
    : "0.0.0.0";
const port = Number(process.env.PORT) || 4173;
const root = __dirname;
const dbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(root, "data", "app.sqlite");
const legacyDbPath = process.env.LEGACY_DB_PATH ? path.resolve(process.env.LEGACY_DB_PATH) : path.join(root, "db.json");
const uploadRoot = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(root, "uploads");
const emailOutboxDir = process.env.EMAIL_OUTBOX_DIR ? path.resolve(process.env.EMAIL_OUTBOX_DIR) : path.join(root, "data", "email-outbox");
const appBaseUrl = process.env.APP_BASE_URL || `http://${host}:${port}`;
const store = createSqliteStore({ dbPath, legacyDbPath });
const emailService = createEmailService({
    mode: process.env.EMAIL_MODE || "dev-log",
    outboxDir: emailOutboxDir,
    fromEmail: process.env.EMAIL_FROM || "no-reply@lifetimelinetracker.local",
    smtp: {
        host: process.env.SMTP_HOST || "",
        port: process.env.SMTP_PORT || "",
        secure: process.env.SMTP_SECURE,
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || ""
    }
});
const uploadService = createUploadService({
    rootDir: uploadRoot,
    maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES) || 2 * 1024 * 1024
});
const recordService = createRecordService({ store, uploadService });
const authService = createAuthService({
    store,
    createSampleRecords: recordService.createSampleRecords,
    emailVerificationTtlHours: Number(process.env.EMAIL_VERIFICATION_TTL_HOURS) || 24,
    exposeResetToken: process.env.NODE_ENV !== "production",
    exposeVerificationToken: process.env.NODE_ENV !== "production",
    emailService,
    appBaseUrl
});
const sessionMaxAgeSeconds = Number(process.env.SESSION_MAX_AGE_SECONDS) || 60 * 60 * 24 * 7;
const sessionTtlMs = sessionMaxAgeSeconds * 1000;
const isProduction = process.env.NODE_ENV === "production";
const authRateLimiter = createRateLimiter({
    windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 60 * 1000,
    maxRequests: Number(process.env.AUTH_RATE_LIMIT_MAX) || 30
});

const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg"
};

store.ensureDb();

const server = http.createServer(async function(req, res) {
    try {
        applySecurityHeaders(res);
        const requestUrl = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);

        if (req.method === "GET" && requestUrl.pathname === "/health") {
            sendJson(res, 200, {
                ok: true,
                service: "life-timeline-tracker",
                timestamp: new Date().toISOString()
            });
            return;
        }

        if (requestUrl.pathname.startsWith("/api/")) {
            await handleApi(req, res, requestUrl);
            return;
        }

        serveStaticFile(requestUrl.pathname, res);
    } catch (error) {
        if (error instanceof AppError) {
            sendJson(res, error.statusCode, { error: error.message });
            return;
        }

        sendJson(res, 500, { error: "Internal server error." });
    }
});

server.listen(port, function() {
    console.log(`Life Timeline Tracker is running at http://${host}:${port}`);
});

function serveStaticFile(requestPath, res) {
    const rawPath = requestPath === "/" ? "/index.html" : requestPath;
    const safePath = path.normalize(rawPath).replace(/^(\.\.[/\\])+/, "");
    const filePath = path.join(root, safePath);
    const blockedFiles = new Set([
        path.join(root, "db.json"),
        path.join(root, "server.js"),
        path.join(root, "data", "app.sqlite")
    ]);
    const blockedDirectories = [
        path.join(root, "lib"),
        path.join(root, "services"),
        path.join(root, "tests"),
        path.join(root, "docs"),
        path.join(root, ".git"),
        path.join(root, ".agents")
    ];

    const isBlockedDirectory = blockedDirectories.some(function(blockedDirectory) {
        return filePath === blockedDirectory || filePath.startsWith(`${blockedDirectory}${path.sep}`);
    });

    if (!filePath.startsWith(root) || blockedFiles.has(filePath) || isBlockedDirectory) {
        sendText(res, 403, "Forbidden");
        return;
    }

    fs.readFile(filePath, function(error, content) {
        if (error) {
            sendText(res, 404, "Not found");
            return;
        }

        const extension = path.extname(filePath).toLowerCase();
        res.writeHead(200, buildHeaders({
            "Content-Type": mimeTypes[extension] || "application/octet-stream"
        }));
        res.end(content);
    });
}

async function handleApi(req, res, requestUrl) {
    if (req.method === "POST" && isRateLimitedAuthPath(requestUrl.pathname)) {
        const limitResult = authRateLimiter.check(buildAuthRateLimitKey(req, requestUrl.pathname));
        if (!limitResult.allowed) {
            sendJson(res, 429, {
                error: "Too many authentication attempts. Please wait and try again."
            }, {
                "Retry-After": String(limitResult.retryAfterSeconds)
            });
            return;
        }
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/auth/signup") {
        const body = await readJsonBody(req, res);
        if (!body) {
            return;
        }

        sendJson(res, 201, await authService.signup(body));
        return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/auth/login") {
        const body = await readJsonBody(req, res);
        if (!body) {
            return;
        }

        const user = authService.login(body);
        const session = createSession(user);
        sendJsonWithCookie(res, 200, {
            user: {
                id: user.id,
                fullName: user.fullName,
                email: user.email
            },
            csrfToken: session.csrfToken
        }, session.id);
        return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/auth/forgot-password") {
        const body = await readJsonBody(req, res);
        if (!body) {
            return;
        }

        sendJson(res, 200, await authService.requestPasswordReset(body));
        return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/auth/verify-email") {
        const body = await readJsonBody(req, res);
        if (!body) {
            return;
        }

        sendJson(res, 200, await authService.verifyEmail(body));
        return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/auth/resend-verification") {
        const body = await readJsonBody(req, res);
        if (!body) {
            return;
        }

        sendJson(res, 200, await authService.resendVerification(body));
        return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/auth/reset-password") {
        const body = await readJsonBody(req, res);
        if (!body) {
            return;
        }

        sendJson(res, 200, authService.resetPassword(body));
        return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/auth/logout") {
        const session = requireCsrfSession(req, res);
        if (!session) {
            return;
        }

        handleLogout(req, res, session);
        return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/uploads") {
        const session = requireCsrfSession(req, res);
        if (!session) {
            return;
        }

        const user = requireUser(req, res);
        if (!user) {
            return;
        }

        const body = await readJsonBody(req, res);
        if (!body) {
            return;
        }

        sendJson(res, 201, uploadService.saveUserDocument(user.id, body));
        return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/auth/me") {
        const session = getSession(req);
        if (!session) {
            sendJson(res, 401, { error: "Not authenticated." });
            return;
        }

        sendJson(res, 200, {
            user: {
                id: session.user.id,
                fullName: session.user.fullName,
                email: session.user.email
            },
            csrfToken: session.csrfToken
        });
        return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/records") {
        const user = requireUser(req, res);
        if (!user) {
            return;
        }

        sendJson(res, 200, { records: recordService.listRecords(user.id) });
        return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/records") {
        const session = requireCsrfSession(req, res);
        if (!session) {
            return;
        }

        const user = requireUser(req, res);
        if (!user) {
            return;
        }

        const body = await readJsonBody(req, res);
        if (!body) {
            return;
        }

        const record = recordService.saveRecord(user.id, body);
        sendJson(res, 200, { record });
        return;
    }

    if (req.method === "DELETE" && requestUrl.pathname.startsWith("/api/records/")) {
        const session = requireCsrfSession(req, res);
        if (!session) {
            return;
        }

        const user = requireUser(req, res);
        if (!user) {
            return;
        }

        const pathParts = requestUrl.pathname.split("/").filter(Boolean);
        const recordId = decodeURIComponent(pathParts[2] || "");

        if (pathParts.length === 4 && pathParts[3] === "document") {
            sendJson(res, 200, { record: recordService.removeRecordDocument(user.id, recordId) });
            return;
        }

        sendJson(res, 200, recordService.deleteRecord(user.id, recordId));
        return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/records/demo-load") {
        const session = requireCsrfSession(req, res);
        if (!session) {
            return;
        }

        const user = requireUser(req, res);
        if (!user) {
            return;
        }

        sendJson(res, 200, { records: recordService.loadDemoData(user.id) });
        return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/records/reset") {
        const session = requireCsrfSession(req, res);
        if (!session) {
            return;
        }

        const user = requireUser(req, res);
        if (!user) {
            return;
        }

        sendJson(res, 200, { records: recordService.resetRecords(user.id) });
        return;
    }

    sendJson(res, 404, { error: "API route not found." });
}

function handleLogout(req, res, session) {
    if (session && session.id) {
        store.deleteSession(session.id);
    }

    res.writeHead(200, buildHeaders({
        "Content-Type": "application/json; charset=utf-8",
        "Set-Cookie": createExpiredSessionCookie()
    }));
    res.end(JSON.stringify({ success: true }));
}

function requireUser(req, res) {
    const session = getSession(req);
    if (!session) {
        sendJson(res, 401, { error: "Not authenticated." });
        return null;
    }

    const user = authService.getUserById(session.user.id);
    if (!user) {
        sendJson(res, 401, { error: "User not found." });
        return null;
    }

    return user;
}

function requireCsrfSession(req, res) {
    const session = getSession(req);
    if (!session) {
        sendJson(res, 401, { error: "Not authenticated." });
        return null;
    }

    const incomingToken = String(req.headers["x-csrf-token"] || "").trim();
    if (!incomingToken || incomingToken !== session.csrfToken) {
        sendJson(res, 403, { error: "CSRF token is missing or invalid." });
        return null;
    }

    return session;
}

function getSession(req) {
    purgeExpiredSessions();
    const cookies = parseCookies(req);
    const sessionId = cookies.sessionId;
    if (!sessionId) {
        return null;
    }

    const session = store.findSessionById(sessionId, new Date().toISOString());
    if (!session) {
        return null;
    }

    return session;
}

function createSession(user) {
    purgeExpiredSessions();
    const sessionId = crypto.randomBytes(24).toString("hex");
    const csrfToken = crypto.randomBytes(24).toString("hex");
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + sessionTtlMs).toISOString();
    store.createSession({
        id: sessionId,
        userId: user.id,
        csrfToken,
        createdAt,
        expiresAt
    });
    return {
        id: sessionId,
        csrfToken
    };
}

function parseCookies(req) {
    const raw = req.headers.cookie || "";
    return raw.split(";").reduce(function(acc, part) {
        const pieces = part.trim().split("=");
        if (pieces[0]) {
            acc[pieces[0]] = decodeURIComponent(pieces.slice(1).join("="));
        }
        return acc;
    }, {});
}

function purgeExpiredSessions() {
    store.deleteExpiredSessions(new Date().toISOString());
}

function sendJson(res, statusCode, data, extraHeaders) {
    res.writeHead(statusCode, buildHeaders(Object.assign({
        "Content-Type": "application/json; charset=utf-8"
    }, extraHeaders || {})));
    res.end(JSON.stringify(data));
}

function sendJsonWithCookie(res, statusCode, data, sessionId) {
    res.writeHead(statusCode, buildHeaders({
        "Content-Type": "application/json; charset=utf-8",
        "Set-Cookie": createSessionCookie(sessionId)
    }));
    res.end(JSON.stringify(data));
}

function sendText(res, statusCode, text) {
    res.writeHead(statusCode, buildHeaders({
        "Content-Type": "text/plain; charset=utf-8"
    }));
    res.end(text);
}

function applySecurityHeaders(res) {
    for (const [name, value] of Object.entries(buildSecurityHeaders())) {
        res.setHeader(name, value);
    }
}

function buildHeaders(extraHeaders) {
    return Object.assign({}, buildSecurityHeaders(), extraHeaders);
}

function buildSecurityHeaders() {
    return {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        "Cache-Control": "no-store"
    };
}

function createSessionCookie(sessionId) {
    const parts = [
        `sessionId=${sessionId}`,
        "Path=/",
        "HttpOnly",
        "SameSite=Lax",
        `Max-Age=${sessionMaxAgeSeconds}`
    ];

    if (isProduction) {
        parts.push("Secure");
    }

    return parts.join("; ");
}

function createExpiredSessionCookie() {
    const parts = [
        "sessionId=",
        "Path=/",
        "HttpOnly",
        "SameSite=Lax",
        "Max-Age=0"
    ];

    if (isProduction) {
        parts.push("Secure");
    }

    return parts.join("; ");
}

function readJsonBody(req, res) {
    return new Promise(function(resolve) {
        let raw = "";
        req.on("data", function(chunk) {
            raw += chunk;
            if (raw.length > 1_000_000) {
                sendJson(res, 413, { error: "Payload too large." });
                req.destroy();
            }
        });
        req.on("end", function() {
            try {
                resolve(raw ? JSON.parse(raw) : {});
            } catch (error) {
                sendJson(res, 400, { error: "Invalid JSON body." });
                resolve(null);
            }
        });
    });
}

function isRateLimitedAuthPath(pathname) {
    return pathname === "/api/auth/signup" ||
        pathname === "/api/auth/login" ||
        pathname === "/api/auth/forgot-password" ||
        pathname === "/api/auth/verify-email" ||
        pathname === "/api/auth/resend-verification" ||
        pathname === "/api/auth/reset-password";
}

function buildAuthRateLimitKey(req, pathname) {
    return `${pathname}:${getClientAddress(req)}`;
}

function getClientAddress(req) {
    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (forwarded) {
        return forwarded;
    }

    return req.socket && req.socket.remoteAddress
        ? req.socket.remoteAddress
        : "unknown";
}
