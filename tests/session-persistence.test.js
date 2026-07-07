const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const projectRoot = path.join(__dirname, "..");
const fixturesDir = path.join(projectRoot, "tests", ".tmp");
const dbPath = path.join(fixturesDir, "session-persistence-db.sqlite");
const legacyDbPath = path.join(fixturesDir, "session-persistence-missing-legacy.json");
const emailOutboxDir = path.join(fixturesDir, "session-persistence-email-outbox");
const port = 4291;
const baseUrl = `http://127.0.0.1:${port}`;

let serverProcess;

test.before(async function() {
    fs.mkdirSync(fixturesDir, { recursive: true });
    cleanupTestArtifacts();
    serverProcess = await startServer();
});

test.after(async function() {
    await stopServer();
    cleanupTestArtifacts();
});

test("session remains valid after server restart", async function() {
    const signupResponse = await request("/api/auth/signup", {
        method: "POST",
        body: {
            fullName: "Persistent Session User",
            email: "persistent-session@example.com",
            password: "strongpass10"
        }
    });

    const verifyResponse = await request("/api/auth/verify-email", {
        method: "POST",
        body: {
            token: signupResponse.body.verificationToken
        }
    });

    assert.equal(verifyResponse.status, 200);

    const loginResponse = await request("/api/auth/login", {
        method: "POST",
        body: {
            email: "persistent-session@example.com",
            password: "strongpass10"
        }
    });

    assert.equal(loginResponse.status, 200);
    const cookie = getSessionCookie(loginResponse);

    await stopServer();
    serverProcess = await startServer();

    const meAfterRestart = await request("/api/auth/me", {
        headers: {
            Cookie: cookie
        }
    });

    assert.equal(meAfterRestart.status, 200);
    assert.equal(meAfterRestart.body.user.email, "persistent-session@example.com");
});

async function startServer() {
    const child = spawn(process.execPath, ["server.js"], {
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

    await waitForServerReady(child);
    return child;
}

async function stopServer() {
    if (serverProcess && !serverProcess.killed) {
        serverProcess.kill();
        await onceExit(serverProcess);
    }
}

async function waitForServerReady(childProcess) {
    await new Promise(function(resolve, reject) {
        const timeout = setTimeout(function() {
            reject(new Error("Timed out waiting for session persistence test server to start."));
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
            reject(new Error(`Session persistence test server exited early with code ${code}.`));
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
}

function isIgnorableWarning(chunk) {
    return String(chunk).includes("ExperimentalWarning: SQLite is an experimental feature");
}
