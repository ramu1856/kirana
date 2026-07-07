const fs = require("fs");
const path = require("path");

function createFileStore(options) {
    const dbPath = path.resolve(options.dbPath);

    function ensureDb() {
        const directoryPath = path.dirname(dbPath);
        if (!fs.existsSync(directoryPath)) {
            fs.mkdirSync(directoryPath, { recursive: true });
        }

        if (fs.existsSync(dbPath)) {
            return;
        }

        writeDb({
            users: []
        });
    }

    function readDb() {
        const parsed = JSON.parse(fs.readFileSync(dbPath, "utf8"));
        if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.users)) {
            throw new Error("Database file is malformed.");
        }
        return parsed;
    }

    function writeDb(db) {
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    }

    function findUserByEmail(email) {
        const db = readDb();
        return db.users.find(function(user) {
            return user.email === email;
        }) || null;
    }

    function findUserById(userId) {
        const db = readDb();
        return db.users.find(function(user) {
            return user.id === userId;
        }) || null;
    }

    function createUser(user) {
        const db = readDb();
        db.users.push(user);
        writeDb(db);
        return user;
    }

    function getRecordsByUserId(userId) {
        const user = findUserById(userId);
        return user ? (user.records || []) : null;
    }

    function saveRecordForUser(userId, record) {
        const db = readDb();
        const user = db.users.find(function(item) {
            return item.id === userId;
        });

        if (!user) {
            return null;
        }

        user.records = user.records || [];
        const existingIndex = user.records.findIndex(function(item) {
            return item.id === record.id;
        });

        if (existingIndex >= 0) {
            user.records[existingIndex] = record;
        } else {
            user.records.unshift(record);
        }

        writeDb(db);
        return record;
    }

    function deleteRecordForUser(userId, recordId) {
        const db = readDb();
        const user = db.users.find(function(item) {
            return item.id === userId;
        });

        if (!user) {
            return false;
        }

        user.records = (user.records || []).filter(function(record) {
            return record.id !== recordId;
        });

        writeDb(db);
        return true;
    }

    function replaceRecordsForUser(userId, records) {
        const db = readDb();
        const user = db.users.find(function(item) {
            return item.id === userId;
        });

        if (!user) {
            return null;
        }

        user.records = records.slice();
        writeDb(db);
        return user.records;
    }

    return {
        ensureDb,
        findUserByEmail,
        findUserById,
        createUser,
        getRecordsByUserId,
        saveRecordForUser,
        deleteRecordForUser,
        replaceRecordsForUser
    };
}

module.exports = {
    createFileStore
};
