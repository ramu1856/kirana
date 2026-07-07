const migrations = [
    {
        id: "001_initial_schema",
        up(db) {
            db.exec(`
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    full_name TEXT NOT NULL,
                    email TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS records (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    category TEXT NOT NULL,
                    subtype TEXT NOT NULL,
                    title TEXT NOT NULL,
                    organization TEXT NOT NULL,
                    start_date TEXT NOT NULL,
                    end_date TEXT NOT NULL,
                    status TEXT NOT NULL,
                    location TEXT NOT NULL,
                    reminder_date TEXT NOT NULL,
                    document_name TEXT NOT NULL,
                    document_link TEXT NOT NULL,
                    tags_json TEXT NOT NULL,
                    description TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                );
            `);
        }
    },
    {
        id: "002_record_indexes",
        up(db) {
            db.exec(`
                CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
                CREATE INDEX IF NOT EXISTS idx_records_user_id ON records(user_id);
                CREATE INDEX IF NOT EXISTS idx_records_user_start_date ON records(user_id, start_date DESC);
            `);
        }
    },
    {
        id: "003_password_reset_columns",
        up(db) {
            db.exec(`
                ALTER TABLE users ADD COLUMN reset_token_hash TEXT;
            `);
            db.exec(`
                ALTER TABLE users ADD COLUMN reset_token_expires_at TEXT;
            `);
        }
    },
    {
        id: "004_email_verification_columns",
        up(db) {
            db.exec(`
                ALTER TABLE users ADD COLUMN email_verified_at TEXT;
            `);
            db.exec(`
                ALTER TABLE users ADD COLUMN email_verification_token_hash TEXT;
            `);
            db.exec(`
                ALTER TABLE users ADD COLUMN email_verification_token_expires_at TEXT;
            `);
            db.exec(`
                UPDATE users
                SET email_verified_at = COALESCE(email_verified_at, created_at)
                WHERE email_verified_at IS NULL
            `);
        }
    },
    {
        id: "005_sessions_table",
        up(db) {
            db.exec(`
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    csrf_token TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
                CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
            `);
        }
    },
    {
        id: "006_session_csrf_column",
        up(db) {
            db.exec(`
                ALTER TABLE sessions ADD COLUMN csrf_token TEXT;
            `);
        }
    }
];

function runMigrations(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL
        );
    `);

    const appliedIds = new Set(
        db.prepare("SELECT id FROM schema_migrations ORDER BY id").all().map(function(row) {
            return row.id;
        })
    );

    const insertMigration = db.prepare(`
        INSERT INTO schema_migrations (id, applied_at)
        VALUES (?, ?)
    `);

    for (const migration of migrations) {
        if (appliedIds.has(migration.id)) {
            continue;
        }

        db.exec("BEGIN");
        try {
            migration.up(db);
            insertMigration.run(migration.id, new Date().toISOString());
            db.exec("COMMIT");
        } catch (error) {
            db.exec("ROLLBACK");
            if (
                (
                    migration.id === "003_password_reset_columns" ||
                    migration.id === "004_email_verification_columns" ||
                    migration.id === "006_session_csrf_column"
                ) &&
                /duplicate column name/i.test(String(error.message || ""))
            ) {
                continue;
            }
            throw error;
        }
    }
}

module.exports = {
    runMigrations
};
