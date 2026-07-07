const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { runMigrations } = require("./migrations");

function createSqliteStore(options) {
    const dbPath = path.resolve(options.dbPath);
    const legacyDbPath = options.legacyDbPath ? path.resolve(options.legacyDbPath) : null;
    let db = null;

    function ensureDb() {
        const directoryPath = path.dirname(dbPath);
        if (!fs.existsSync(directoryPath)) {
            fs.mkdirSync(directoryPath, { recursive: true });
        }

        db = new DatabaseSync(dbPath);
        db.exec("PRAGMA foreign_keys = ON");
        runMigrations(db);

        migrateLegacyJsonIfNeeded();
    }

    function migrateLegacyJsonIfNeeded() {
        if (!legacyDbPath || !fs.existsSync(legacyDbPath)) {
            return;
        }

        const userCount = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
        if (userCount > 0) {
            return;
        }

        const raw = JSON.parse(fs.readFileSync(legacyDbPath, "utf8"));
        if (!raw || !Array.isArray(raw.users)) {
            return;
        }

        const insertUser = db.prepare(`
            INSERT INTO users (
                id, full_name, email, password_hash, created_at,
                email_verified_at, email_verification_token_hash, email_verification_token_expires_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const insertRecord = db.prepare(`
            INSERT INTO records (
                id, user_id, category, subtype, title, organization, start_date, end_date,
                status, location, reminder_date, document_name, document_link, tags_json, description
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        withTransaction(function() {
            for (const user of raw.users) {
                insertUser.run(
                    user.id,
                    user.fullName,
                    user.email,
                    user.passwordHash,
                    user.createdAt,
                    user.emailVerifiedAt || user.createdAt,
                    user.emailVerificationTokenHash || null,
                    user.emailVerificationTokenExpiresAt || null
                );

                for (const record of user.records || []) {
                    insertRecord.run(
                        record.id,
                        user.id,
                        record.category || "",
                        record.subtype || "",
                        record.title || "",
                        record.organization || "",
                        record.startDate || "",
                        record.endDate || "",
                        record.status || "",
                        record.location || "",
                        record.reminderDate || "",
                        record.documentName || "",
                        record.documentLink || "",
                        JSON.stringify(Array.isArray(record.tags) ? record.tags : []),
                        record.description || ""
                    );
                }
            }
        });
    }

    function findUserByEmail(email) {
        ensureOpen();
        const row = db.prepare(`
            SELECT id, full_name, email, password_hash, created_at, reset_token_hash, reset_token_expires_at,
                   email_verified_at, email_verification_token_hash, email_verification_token_expires_at
            FROM users
            WHERE email = ?
        `).get(email);

        return row ? mapUserRow(row) : null;
    }

    function findUserById(userId) {
        ensureOpen();
        const row = db.prepare(`
            SELECT id, full_name, email, password_hash, created_at, reset_token_hash, reset_token_expires_at,
                   email_verified_at, email_verification_token_hash, email_verification_token_expires_at
            FROM users
            WHERE id = ?
        `).get(userId);

        return row ? mapUserRow(row) : null;
    }

    function createUser(user) {
        ensureOpen();
        const insertUser = db.prepare(`
            INSERT INTO users (
                id, full_name, email, password_hash, created_at,
                email_verified_at, email_verification_token_hash, email_verification_token_expires_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const insertRecord = db.prepare(`
            INSERT INTO records (
                id, user_id, category, subtype, title, organization, start_date, end_date,
                status, location, reminder_date, document_name, document_link, tags_json, description
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        withTransaction(function() {
            insertUser.run(
                user.id,
                user.fullName,
                user.email,
                user.passwordHash,
                user.createdAt,
                user.emailVerifiedAt || null,
                user.emailVerificationTokenHash || null,
                user.emailVerificationTokenExpiresAt || null
            );

            for (const record of user.records || []) {
                insertRecord.run(
                    record.id,
                    user.id,
                    record.category,
                    record.subtype,
                    record.title,
                    record.organization,
                    record.startDate,
                    record.endDate,
                    record.status,
                    record.location,
                    record.reminderDate,
                    record.documentName,
                    record.documentLink,
                    JSON.stringify(record.tags || []),
                    record.description
                );
            }
        });
        return user;
    }

    function savePasswordResetToken(userId, tokenHash, expiresAt) {
        ensureOpen();
        db.prepare(`
            UPDATE users
            SET reset_token_hash = ?, reset_token_expires_at = ?
            WHERE id = ?
        `).run(tokenHash, expiresAt, userId);
    }

    function findUserByResetToken(tokenHash, nowIso) {
        ensureOpen();
        const row = db.prepare(`
            SELECT id, full_name, email, password_hash, created_at, reset_token_hash, reset_token_expires_at,
                   email_verified_at, email_verification_token_hash, email_verification_token_expires_at
            FROM users
            WHERE reset_token_hash = ? AND reset_token_expires_at IS NOT NULL AND reset_token_expires_at > ?
        `).get(tokenHash, nowIso);

        return row ? mapUserRow(row) : null;
    }

    function updateUserPassword(userId, passwordHash) {
        ensureOpen();
        db.prepare(`
            UPDATE users
            SET password_hash = ?, reset_token_hash = NULL, reset_token_expires_at = NULL
            WHERE id = ?
        `).run(passwordHash, userId);
    }

    function saveEmailVerificationToken(userId, tokenHash, expiresAt) {
        ensureOpen();
        db.prepare(`
            UPDATE users
            SET email_verification_token_hash = ?, email_verification_token_expires_at = ?, email_verified_at = NULL
            WHERE id = ?
        `).run(tokenHash, expiresAt, userId);
    }

    function findUserByEmailVerificationToken(tokenHash, nowIso) {
        ensureOpen();
        const row = db.prepare(`
            SELECT id, full_name, email, password_hash, created_at, reset_token_hash, reset_token_expires_at,
                   email_verified_at, email_verification_token_hash, email_verification_token_expires_at
            FROM users
            WHERE email_verification_token_hash = ?
              AND email_verification_token_expires_at IS NOT NULL
              AND email_verification_token_expires_at > ?
        `).get(tokenHash, nowIso);

        return row ? mapUserRow(row) : null;
    }

    function markUserEmailVerified(userId, verifiedAt) {
        ensureOpen();
        db.prepare(`
            UPDATE users
            SET email_verified_at = ?, email_verification_token_hash = NULL, email_verification_token_expires_at = NULL
            WHERE id = ?
        `).run(verifiedAt, userId);
    }

    function createSession(session) {
        ensureOpen();
        db.prepare(`
            INSERT INTO sessions (id, user_id, csrf_token, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?)
        `).run(session.id, session.userId, session.csrfToken, session.createdAt, session.expiresAt);
    }

    function findSessionById(sessionId, nowIso) {
        ensureOpen();
        const row = db.prepare(`
            SELECT s.id, s.user_id, s.csrf_token, s.created_at, s.expires_at,
                   u.full_name, u.email
            FROM sessions s
            INNER JOIN users u ON u.id = s.user_id
            WHERE s.id = ? AND s.expires_at > ?
        `).get(sessionId, nowIso);

        return row ? {
            id: row.id,
            userId: row.user_id,
            csrfToken: row.csrf_token,
            createdAt: row.created_at,
            expiresAt: row.expires_at,
            user: {
                id: row.user_id,
                fullName: row.full_name,
                email: row.email
            }
        } : null;
    }

    function deleteSession(sessionId) {
        ensureOpen();
        db.prepare(`
            DELETE FROM sessions
            WHERE id = ?
        `).run(sessionId);
    }

    function deleteExpiredSessions(nowIso) {
        ensureOpen();
        db.prepare(`
            DELETE FROM sessions
            WHERE expires_at <= ?
        `).run(nowIso);
    }

    function getRecordsByUserId(userId) {
        ensureOpen();
        const rows = db.prepare(`
            SELECT id, category, subtype, title, organization, start_date, end_date, status,
                   location, reminder_date, document_name, document_link, tags_json, description
            FROM records
            WHERE user_id = ?
            ORDER BY start_date DESC, id DESC
        `).all(userId);

        return rows.map(mapRecordRow);
    }

    function saveRecordForUser(userId, record) {
        ensureOpen();
        const existing = db.prepare("SELECT id FROM records WHERE id = ? AND user_id = ?").get(record.id, userId);

        if (existing) {
            db.prepare(`
                UPDATE records
                SET category = ?, subtype = ?, title = ?, organization = ?, start_date = ?, end_date = ?,
                    status = ?, location = ?, reminder_date = ?, document_name = ?, document_link = ?,
                    tags_json = ?, description = ?
                WHERE id = ? AND user_id = ?
            `).run(
                record.category,
                record.subtype,
                record.title,
                record.organization,
                record.startDate,
                record.endDate,
                record.status,
                record.location,
                record.reminderDate,
                record.documentName,
                record.documentLink,
                JSON.stringify(record.tags || []),
                record.description,
                record.id,
                userId
            );
            return record;
        }

        db.prepare(`
            INSERT INTO records (
                id, user_id, category, subtype, title, organization, start_date, end_date,
                status, location, reminder_date, document_name, document_link, tags_json, description
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            record.id,
            userId,
            record.category,
            record.subtype,
            record.title,
            record.organization,
            record.startDate,
            record.endDate,
            record.status,
            record.location,
            record.reminderDate,
            record.documentName,
            record.documentLink,
            JSON.stringify(record.tags || []),
            record.description
        );

        return record;
    }

    function deleteRecordForUser(userId, recordId) {
        ensureOpen();
        const result = db.prepare("DELETE FROM records WHERE user_id = ? AND id = ?").run(userId, recordId);
        return result.changes > 0;
    }

    function replaceRecordsForUser(userId, records) {
        ensureOpen();
        const deleteExisting = db.prepare("DELETE FROM records WHERE user_id = ?");
        const insertRecord = db.prepare(`
            INSERT INTO records (
                id, user_id, category, subtype, title, organization, start_date, end_date,
                status, location, reminder_date, document_name, document_link, tags_json, description
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        withTransaction(function() {
            deleteExisting.run(userId);

            for (const record of records) {
                insertRecord.run(
                    record.id,
                    userId,
                    record.category,
                    record.subtype,
                    record.title,
                    record.organization,
                    record.startDate,
                    record.endDate,
                    record.status,
                    record.location,
                    record.reminderDate,
                    record.documentName,
                    record.documentLink,
                    JSON.stringify(record.tags || []),
                    record.description
                );
            }
        });
        return records.slice();
    }

    function ensureOpen() {
        if (!db) {
            throw new Error("Store has not been initialized. Call ensureDb() first.");
        }
    }

    function withTransaction(work) {
        db.exec("BEGIN");
        try {
            work();
            db.exec("COMMIT");
        } catch (error) {
            db.exec("ROLLBACK");
            throw error;
        }
    }

    function mapUserRow(row) {
        return {
            id: row.id,
            fullName: row.full_name,
            email: row.email,
            passwordHash: row.password_hash,
            createdAt: row.created_at,
            resetTokenHash: row.reset_token_hash || null,
            resetTokenExpiresAt: row.reset_token_expires_at || null,
            emailVerifiedAt: row.email_verified_at || null,
            emailVerificationTokenHash: row.email_verification_token_hash || null,
            emailVerificationTokenExpiresAt: row.email_verification_token_expires_at || null
        };
    }

    function mapRecordRow(row) {
        return {
            id: row.id,
            category: row.category,
            subtype: row.subtype,
            title: row.title,
            organization: row.organization,
            startDate: row.start_date,
            endDate: row.end_date,
            status: row.status,
            location: row.location,
            reminderDate: row.reminder_date,
            documentName: row.document_name,
            documentLink: row.document_link,
            tags: parseTags(row.tags_json),
            description: row.description
        };
    }

    function parseTags(tagsJson) {
        try {
            const parsed = JSON.parse(tagsJson);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    }

    return {
        ensureDb,
        findUserByEmail,
        findUserById,
        createUser,
        savePasswordResetToken,
        findUserByResetToken,
        updateUserPassword,
        saveEmailVerificationToken,
        findUserByEmailVerificationToken,
        markUserEmailVerified,
        createSession,
        findSessionById,
        deleteSession,
        deleteExpiredSessions,
        getRecordsByUserId,
        saveRecordForUser,
        deleteRecordForUser,
        replaceRecordsForUser
    };
}

module.exports = {
    createSqliteStore
};
