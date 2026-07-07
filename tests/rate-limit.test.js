const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const projectRoot = path.join(__dirname, "..");
const fixturesDir = path.join(projectRoot, "tests", ".tmp");
const dbPath = path.join(fixturesDir, "rate-limit-db.sqlite");
const legacyDbPath = path.join(fixturesDir, "rate-limit-missing-legacy.json");
const emailOutboxDir = path.join(fixturesDir, "rate-limit-email-outbox");
const port = 4290;
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
            AUTH_RATE_LIMIT_WINDOW_MS: "60000",
            AUTH_RATE_LIMIT_MAX: "2",
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

test("auth rate limit blocks repeated attempts per route and client", async function() {
    const clientHeaders = {
        "X-Forwarded-For": "198.51.100.25"
    };

    const first = await request("/api/auth/login", {
        method: "POST",
        headers: clientHeaders,
        body: {
            email: "nobody@example.com",
            password: "wrongpass1"
        }
    });

    const second = await request("/api/auth/login", {
        method: "POST",
        headers: clientHeaders,
        body: {
            email: "nobody@example.com",
            password: "wrongpass1"
        }
    });

    const third = await request("/api/auth/login", {
        method: "POST",
        headers: clientHeaders,
        body: {
            email: "nobody@example.com",
            password: "wrongpass1"
        }
    });

    assert.equal(first.status, 401);
    assert.equal(second.status, 401);
    assert.equal(third.status, 429);
    assert.equal(third.body.error, "Too many authentication attempts. Please wait and try again.");
    assert.equal(third.headers.get("retry-after"), "60");

    const differentRoute = await request("/api/auth/forgot-password", {
        method: "POST",
        headers: clientHeaders,
        body: {
            email: "nobody@example.com"
        }
    });

    assert.equal(differentRoute.status, 200);
});

async function waitForServerReady(childProcess) {
    await new Promise(function(resolve, reject) {
        const timeout = setTimeout(function() {
            reject(new Error("Timed out waiting for rate-limit test server to start."));
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
            reject(new Error(`Rate-limit test server exited early with code ${code}.`));
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
