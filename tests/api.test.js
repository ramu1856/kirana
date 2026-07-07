const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const projectRoot = path.join(__dirname, "..");
const fixturesDir = path.join(projectRoot, "tests", ".tmp");
const dbPath = path.join(fixturesDir, "test-db.sqlite");
const legacyDbPath = path.join(fixturesDir, "missing-legacy.json");
const emailOutboxDir = path.join(fixturesDir, "email-outbox");
const port = 4289;
const baseUrl = `http://127.0.0.1:${port}`;

let serverProcess;

test.before(async function() {
    fs.mkdirSync(fixturesDir, { recursive: true });
    cleanupTestArtifacts();

    serverProcess = spawn(process.execPath, ["server.js"], {
        cwd: projectRoot,
        env: Object.assign({}, process.env, {
            PORT: String(port),
            DB_PATH: dbPath,
            LEGACY_DB_PATH: legacyDbPath,
            EMAIL_OUTBOX_DIR: emailOutboxDir,
            APP_BASE_URL: baseUrl,
            NODE_ENV: "test"
        }),
        stdio: ["ignore", "pipe", "pipe"]
    });

    await waitForServerReady(serverProcess);
});

test.after(async function() {
    if (serverProcess && !serverProcess.killed) {
        serverProcess.kill();
        await onceExit(serverProcess);
    }

    cleanupTestArtifacts();
});

test("signup requires email verification before login and protected access", async function() {
    const signupResponse = await signupUser({
        fullName: "Test User",
        email: "test@example.com",
        password: "strongpass1"
    });

    assert.equal(signupResponse.status, 201);
    assert.equal(typeof signupResponse.body.verificationToken, "string");
    assert.equal(signupResponse.body.verificationUrl, `${baseUrl}/#auth-verify?token=${signupResponse.body.verificationToken}`);
    assert.equal(signupResponse.body.delivery.mode, "dev-log");
    assert.equal(fs.existsSync(signupResponse.body.delivery.preview.filePath), true);
    assert.equal(signupResponse.headers.get("set-cookie"), null);

    const blockedLogin = await request("/api/auth/login", {
        method: "POST",
        body: {
            email: "test@example.com",
            password: "strongpass1"
        }
    });

    assert.equal(blockedLogin.status, 403);
    assert.equal(blockedLogin.body.error, "Verify your email before logging in.");

    const verifyResponse = await verifyEmailToken(signupResponse.body.verificationToken);
    assert.equal(verifyResponse.status, 200);

    const loginResponse = await loginUser("test@example.com", "strongpass1");
    assert.equal(loginResponse.status, 200);
    assert.equal(loginResponse.body.user.email, "test@example.com");
    assert.match(loginResponse.headers.get("set-cookie") || "", /sessionId=/);

    const auth = getAuthFromLogin(loginResponse);
    const meResponse = await request("/api/auth/me", {
        headers: {
            Cookie: auth.cookie
        }
    });

    assert.equal(meResponse.status, 200);
    assert.equal(meResponse.body.user.fullName, "Test User");

    const logoutResponse = await request("/api/auth/logout", {
        method: "POST",
        headers: authHeaders(auth)
    });

    assert.equal(logoutResponse.status, 200);

    const afterLogout = await request("/api/auth/me", {
        headers: {
            Cookie: auth.cookie
        }
    });

    assert.equal(afterLogout.status, 401);
});

test("signup validation rejects malformed data", async function() {
    const invalidEmail = await request("/api/auth/signup", {
        method: "POST",
        body: {
            fullName: "Bad Email",
            email: "not-an-email",
            password: "strongpass1"
        }
    });

    assert.equal(invalidEmail.status, 400);
    assert.equal(invalidEmail.body.error, "Enter a valid email address.");

    const shortPassword = await request("/api/auth/signup", {
        method: "POST",
        body: {
            fullName: "Short Password",
            email: "short@example.com",
            password: "123"
        }
    });

    assert.equal(shortPassword.status, 400);
    assert.equal(shortPassword.body.error, "Password must be at least 8 characters long.");
});

test("resend verification rotates the token and invalidates the old one", async function() {
    const signupResponse = await signupUser({
        fullName: "Resend User",
        email: "resend-user@example.com",
        password: "strongpass2"
    });

    const resendResponse = await request("/api/auth/resend-verification", {
        method: "POST",
        body: {
            email: "resend-user@example.com"
        }
    });

    assert.equal(resendResponse.status, 200);
    assert.equal(typeof resendResponse.body.verificationToken, "string");
    assert.notEqual(resendResponse.body.verificationToken, signupResponse.body.verificationToken);

    const oldVerifyResponse = await request("/api/auth/verify-email", {
        method: "POST",
        body: {
            token: signupResponse.body.verificationToken
        }
    });

    assert.equal(oldVerifyResponse.status, 400);
    assert.equal(oldVerifyResponse.body.error, "Verification token is invalid or expired.");

    const newVerifyResponse = await verifyEmailToken(resendResponse.body.verificationToken);
    assert.equal(newVerifyResponse.status, 200);
});

test("record validation rejects unauthenticated and invalid requests", async function() {
    const unauthenticated = await request("/api/records");
    assert.equal(unauthenticated.status, 401);

    const auth = await createVerifiedSession({
        fullName: "Record User",
        email: "record-user@example.com",
        password: "strongpass3"
    });

    const invalidRecord = await request("/api/records", {
        method: "POST",
        headers: authHeaders(auth),
        body: {
            category: "Unknown",
            subtype: "Something",
            title: "Bad Record",
            startDate: "2026-07-07",
            status: "Active"
        }
    });

    assert.equal(invalidRecord.status, 400);
    assert.equal(invalidRecord.body.error, "Choose a valid category.");

    const wrongDates = await request("/api/records", {
        method: "POST",
        headers: authHeaders(auth),
        body: {
            category: "Work",
            subtype: "Full-Time",
            title: "Bad Dates",
            startDate: "2026-07-07",
            endDate: "2026-07-01",
            status: "Active"
        }
    });

    assert.equal(wrongDates.status, 400);
    assert.equal(wrongDates.body.error, "End date cannot be earlier than start date.");
});

test("valid record creation succeeds for an authenticated user", async function() {
    const auth = await createVerifiedSession({
        fullName: "Valid Record User",
        email: "valid-record@example.com",
        password: "strongpass4"
    });

    const createResponse = await request("/api/records", {
        method: "POST",
        headers: authHeaders(auth),
        body: {
            category: "Project",
            subtype: "Web App",
            title: "Life Timeline Portal",
            organization: "Personal Build",
            startDate: "2026-07-07",
            endDate: "",
            status: "Active",
            location: "Remote",
            reminderDate: "2026-08-01",
            documentName: "Spec Notes",
            documentLink: "Drive: spec.pdf",
            tags: ["timeline", "mvp"],
            description: "Building the first usable version."
        }
    });

    assert.equal(createResponse.status, 200);
    assert.equal(createResponse.body.record.category, "Project");
    assert.equal(createResponse.body.record.title, "Life Timeline Portal");

    const listResponse = await request("/api/records", {
        headers: {
            Cookie: auth.cookie
        }
    });

    assert.equal(listResponse.status, 200);
    assert.equal(Array.isArray(listResponse.body.records), true);
    assert.equal(listResponse.body.records.some(function(record) {
        return record.title === "Life Timeline Portal";
    }), true);
});

test("password reset flow updates the password and invalidates the token", async function() {
    await createVerifiedSession({
        fullName: "Reset User",
        email: "reset-user@example.com",
        password: "strongpass5"
    });

    const forgotResponse = await request("/api/auth/forgot-password", {
        method: "POST",
        body: {
            email: "reset-user@example.com"
        }
    });

    assert.equal(forgotResponse.status, 200);
    assert.equal(typeof forgotResponse.body.resetToken, "string");
    assert.equal(Boolean(forgotResponse.body.expiresAt), true);
    assert.equal(forgotResponse.body.resetUrl, `${baseUrl}/#auth-reset?token=${forgotResponse.body.resetToken}`);
    assert.equal(forgotResponse.body.delivery.mode, "dev-log");
    assert.equal(fs.existsSync(forgotResponse.body.delivery.preview.filePath), true);
    assert.equal(forgotResponse.body.delivery.preview.url, forgotResponse.body.resetUrl);

    const resetResponse = await request("/api/auth/reset-password", {
        method: "POST",
        body: {
            token: forgotResponse.body.resetToken,
            newPassword: "newstrongpass5"
        }
    });

    assert.equal(resetResponse.status, 200);
    assert.equal(resetResponse.body.message, "Password updated successfully.");

    const oldLogin = await loginUser("reset-user@example.com", "strongpass5");
    assert.equal(oldLogin.status, 401);

    const newLogin = await loginUser("reset-user@example.com", "newstrongpass5");
    assert.equal(newLogin.status, 200);

    const reusedToken = await request("/api/auth/reset-password", {
        method: "POST",
        body: {
            token: forgotResponse.body.resetToken,
            newPassword: "anotherpass5"
        }
    });

    assert.equal(reusedToken.status, 400);
    assert.equal(reusedToken.body.error, "Reset token is invalid or expired.");
});

test("authenticated upload stores a document and returns a usable link", async function() {
    const auth = await createVerifiedSession({
        fullName: "Upload User",
        email: "upload-user@example.com",
        password: "strongpass6"
    });

    const uploadResponse = await request("/api/uploads", {
        method: "POST",
        headers: authHeaders(auth),
        body: {
            fileName: "proof.txt",
            contentBase64: Buffer.from("hello proof file", "utf8").toString("base64")
        }
    });

    assert.equal(uploadResponse.status, 201);
    assert.equal(uploadResponse.body.documentName, "proof.txt");
    assert.match(uploadResponse.body.documentLink, /^\/uploads\//);

    const uploadedFileResponse = await fetch(`${baseUrl}${uploadResponse.body.documentLink}`);
    const uploadedFileText = await uploadedFileResponse.text();

    assert.equal(uploadedFileResponse.status, 200);
    assert.equal(uploadedFileText, "hello proof file");
});

test("document removal clears the record link and deletes the uploaded file", async function() {
    const auth = await createVerifiedSession({
        fullName: "Document Removal User",
        email: "document-removal@example.com",
        password: "strongpass7"
    });

    const uploadResponse = await request("/api/uploads", {
        method: "POST",
        headers: authHeaders(auth),
        body: {
            fileName: "removal-proof.txt",
            contentBase64: Buffer.from("delete me", "utf8").toString("base64")
        }
    });

    const createResponse = await request("/api/records", {
        method: "POST",
        headers: authHeaders(auth),
        body: {
            category: "Work",
            subtype: "Full-Time",
            title: "Document Removal Record",
            organization: "Cleanup Inc",
            startDate: "2026-07-07",
            status: "Active",
            documentName: uploadResponse.body.documentName,
            documentLink: uploadResponse.body.documentLink
        }
    });

    const removeResponse = await request(`/api/records/${encodeURIComponent(createResponse.body.record.id)}/document`, {
        method: "DELETE",
        headers: authHeaders(auth)
    });

    assert.equal(removeResponse.status, 200);
    assert.equal(removeResponse.body.record.documentName, "");
    assert.equal(removeResponse.body.record.documentLink, "");

    const uploadedFileResponse = await fetch(`${baseUrl}${uploadResponse.body.documentLink}`);
    assert.equal(uploadedFileResponse.status, 404);

    const listResponse = await request("/api/records", {
        headers: {
            Cookie: auth.cookie
        }
    });

    const savedRecord = listResponse.body.records.find(function(record) {
        return record.id === createResponse.body.record.id;
    });

    assert.equal(savedRecord.documentName, "");
    assert.equal(savedRecord.documentLink, "");
});

test("record deletion also removes the managed uploaded file", async function() {
    const auth = await createVerifiedSession({
        fullName: "Delete Record User",
        email: "delete-record@example.com",
        password: "strongpass8"
    });

    const uploadResponse = await request("/api/uploads", {
        method: "POST",
        headers: authHeaders(auth),
        body: {
            fileName: "record-delete-proof.txt",
            contentBase64: Buffer.from("remove with record", "utf8").toString("base64")
        }
    });

    const createResponse = await request("/api/records", {
        method: "POST",
        headers: authHeaders(auth),
        body: {
            category: "Project",
            subtype: "Web App",
            title: "Delete Entire Record",
            organization: "Cleanup Project",
            startDate: "2026-07-07",
            status: "Active",
            documentName: uploadResponse.body.documentName,
            documentLink: uploadResponse.body.documentLink
        }
    });

    const deleteResponse = await request(`/api/records/${encodeURIComponent(createResponse.body.record.id)}`, {
        method: "DELETE",
        headers: authHeaders(auth)
    });

    assert.equal(deleteResponse.status, 200);
    assert.equal(deleteResponse.body.success, true);

    const uploadedFileResponse = await fetch(`${baseUrl}${uploadResponse.body.documentLink}`);
    assert.equal(uploadedFileResponse.status, 404);

    const listResponse = await request("/api/records", {
        headers: {
            Cookie: auth.cookie
        }
    });

    assert.equal(listResponse.body.records.some(function(record) {
        return record.id === createResponse.body.record.id;
    }), false);
});

test("record edit with a new managed upload replaces the old file", async function() {
    const auth = await createVerifiedSession({
        fullName: "Replace File User",
        email: "replace-file@example.com",
        password: "strongpass9"
    });

    const firstUpload = await request("/api/uploads", {
        method: "POST",
        headers: authHeaders(auth),
        body: {
            fileName: "first-proof.txt",
            contentBase64: Buffer.from("first file", "utf8").toString("base64")
        }
    });

    const createResponse = await request("/api/records", {
        method: "POST",
        headers: authHeaders(auth),
        body: {
            category: "Project",
            subtype: "Web App",
            title: "Replace Managed File",
            organization: "Update Flow",
            startDate: "2026-07-07",
            status: "Active",
            documentName: firstUpload.body.documentName,
            documentLink: firstUpload.body.documentLink
        }
    });

    const secondUpload = await request("/api/uploads", {
        method: "POST",
        headers: authHeaders(auth),
        body: {
            fileName: "second-proof.txt",
            contentBase64: Buffer.from("second file", "utf8").toString("base64")
        }
    });

    const updateResponse = await request("/api/records", {
        method: "POST",
        headers: authHeaders(auth),
        body: {
            id: createResponse.body.record.id,
            category: "Project",
            subtype: "Web App",
            title: "Replace Managed File",
            organization: "Update Flow",
            startDate: "2026-07-07",
            status: "Active",
            documentName: secondUpload.body.documentName,
            documentLink: secondUpload.body.documentLink
        }
    });

    assert.equal(updateResponse.status, 200);
    assert.equal(updateResponse.body.record.documentLink, secondUpload.body.documentLink);

    const oldFileResponse = await fetch(`${baseUrl}${firstUpload.body.documentLink}`);
    assert.equal(oldFileResponse.status, 404);

    const newFileResponse = await fetch(`${baseUrl}${secondUpload.body.documentLink}`);
    assert.equal(newFileResponse.status, 200);
    assert.equal(await newFileResponse.text(), "second file");
});

test("authenticated writes require a valid csrf token", async function() {
    const auth = await createVerifiedSession({
        fullName: "Csrf User",
        email: "csrf-user@example.com",
        password: "strongpass11"
    });

    const missingToken = await request("/api/records/demo-load", {
        method: "POST",
        headers: {
            Cookie: auth.cookie
        }
    });

    assert.equal(missingToken.status, 403);
    assert.equal(missingToken.body.error, "CSRF token is missing or invalid.");

    const invalidToken = await request("/api/records/reset", {
        method: "POST",
        headers: {
            Cookie: auth.cookie,
            "X-CSRF-Token": "bad-token"
        }
    });

    assert.equal(invalidToken.status, 403);
    assert.equal(invalidToken.body.error, "CSRF token is missing or invalid.");
});

async function signupUser(body) {
    return request("/api/auth/signup", {
        method: "POST",
        body
    });
}

async function verifyEmailToken(token) {
    return request("/api/auth/verify-email", {
        method: "POST",
        body: {
            token
        }
    });
}

async function loginUser(email, password) {
    return request("/api/auth/login", {
        method: "POST",
        body: {
            email,
            password
        }
    });
}

async function createVerifiedSession(user) {
    const signupResponse = await signupUser(user);
    assert.equal(signupResponse.status, 201);
    assert.equal(typeof signupResponse.body.verificationToken, "string");

    const verifyResponse = await verifyEmailToken(signupResponse.body.verificationToken);
    assert.equal(verifyResponse.status, 200);

    const loginResponse = await loginUser(user.email, user.password);
    assert.equal(loginResponse.status, 200);

    return getAuthFromLogin(loginResponse);
}

async function waitForServerReady(childProcess) {
    await new Promise(function(resolve, reject) {
        const timeout = setTimeout(function() {
            reject(new Error("Timed out waiting for test server to start."));
        }, 5000);

        childProcess.stdout.on("data", function(chunk) {
            if (String(chunk).includes("Life Timeline Tracker is running")) {
                clearTimeout(timeout);
                resolve();
            }
        });

        childProcess.stderr.on("data", function(chunk) {
            if (isIgnorableWarning(chunk)) {
                return;
            }
            clearTimeout(timeout);
            reject(new Error(String(chunk)));
        });

        childProcess.on("exit", function(code) {
            clearTimeout(timeout);
            reject(new Error(`Test server exited early with code ${code}.`));
        });
    });
}

async function request(route, options) {
    const response = await fetch(`${baseUrl}${route}`, {
        method: options && options.method ? options.method : "GET",
        headers: Object.assign({
            "Content-Type": "application/json"
        }, options && options.headers ? options.headers : {}),
        body: options && options.body ? JSON.stringify(options.body) : undefined
    });

    const body = await response.json().catch(function() {
        return {};
    });

    return {
        status: response.status,
        body,
        headers: response.headers
    };
}

function getSessionCookie(response) {
    const rawCookie = response.headers.get("set-cookie") || "";
    return rawCookie.split(";")[0];
}

function getAuthFromLogin(response) {
    assert.equal(typeof response.body.csrfToken, "string");
    return {
        cookie: getSessionCookie(response),
        csrfToken: response.body.csrfToken
    };
}

function authHeaders(auth) {
    return {
        Cookie: auth.cookie,
        "X-CSRF-Token": auth.csrfToken
    };
}

function onceExit(childProcess) {
    return new Promise(function(resolve) {
        childProcess.once("exit", resolve);
    });
}

function cleanupTestArtifacts() {
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
    }

    if (fs.existsSync(legacyDbPath)) {
        fs.unlinkSync(legacyDbPath);
    }

    if (fs.existsSync(emailOutboxDir)) {
        fs.rmSync(emailOutboxDir, { recursive: true, force: true });
    }

    const uploadsDir = path.join(projectRoot, "uploads");
    if (fs.existsSync(uploadsDir)) {
        fs.rmSync(uploadsDir, { recursive: true, force: true });
    }
}

function isIgnorableWarning(chunk) {
    return String(chunk).includes("ExperimentalWarning: SQLite is an experimental feature");
}
