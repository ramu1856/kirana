const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { AppError } = require("../lib/app-error");

function createUploadService(options) {
    const rootDir = path.resolve(options.rootDir);
    const maxUploadBytes = options.maxUploadBytes || 2 * 1024 * 1024;

    function saveUserDocument(userId, body) {
        const originalFileName = sanitizeFileName(String(body.fileName || "").trim());
        const contentBase64 = String(body.contentBase64 || "").trim();

        if (!originalFileName || !contentBase64) {
            throw new AppError(400, "File name and file content are required.");
        }

        const buffer = decodeBase64(contentBase64);
        if (!buffer.length) {
            throw new AppError(400, "Uploaded file is empty.");
        }

        if (buffer.length > maxUploadBytes) {
            throw new AppError(400, `Uploaded file must be ${Math.floor(maxUploadBytes / (1024 * 1024))}MB or smaller.`);
        }

        const safeUserId = sanitizePathSegment(userId);
        const userDir = path.join(rootDir, safeUserId);
        fs.mkdirSync(userDir, { recursive: true });

        const storedFileName = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${originalFileName}`;
        const filePath = path.join(userDir, storedFileName);
        fs.writeFileSync(filePath, buffer);

        return {
            documentName: originalFileName,
            documentLink: `/uploads/${encodeURIComponent(safeUserId)}/${encodeURIComponent(storedFileName)}`,
            sizeBytes: buffer.length
        };
    }

    function deleteUserDocument(userId, documentLink) {
        if (!isManagedDocumentLink(documentLink)) {
            return false;
        }

        const safeUserId = sanitizePathSegment(userId);
        const expectedPrefix = `/uploads/${encodeURIComponent(safeUserId)}/`;
        if (!String(documentLink || "").startsWith(expectedPrefix)) {
            throw new AppError(403, "You cannot delete another user's document.");
        }

        const encodedFileName = String(documentLink).slice(expectedPrefix.length);
        const fileName = decodeURIComponent(encodedFileName);
        const filePath = path.join(rootDir, safeUserId, fileName);
        const normalizedRoot = path.join(rootDir, safeUserId);
        const resolvedFilePath = path.resolve(filePath);

        if (!resolvedFilePath.startsWith(path.resolve(normalizedRoot))) {
            throw new AppError(400, "Document path is invalid.");
        }

        if (!fs.existsSync(resolvedFilePath)) {
            return false;
        }

        fs.unlinkSync(resolvedFilePath);
        return true;
    }

    function isManagedDocumentLink(documentLink) {
        return /^\/uploads\/[A-Za-z0-9_-]+\/.+/.test(String(documentLink || ""));
    }

    return {
        saveUserDocument,
        deleteUserDocument,
        isManagedDocumentLink
    };
}

function sanitizeFileName(fileName) {
    const cleaned = fileName.replace(/[^a-zA-Z0-9._ -]/g, "-").replace(/\s+/g, " ").trim();
    return cleaned.slice(0, 120);
}

function sanitizePathSegment(value) {
    return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

function decodeBase64(value) {
    if (!/^[A-Za-z0-9+/=\s]+$/.test(value)) {
        throw new AppError(400, "Uploaded file content is invalid.");
    }

    return Buffer.from(value, "base64");
}

module.exports = {
    createUploadService
};
