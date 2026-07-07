const crypto = require("crypto");
const { AppError } = require("../lib/app-error");

const allowedCategories = new Set(["Education", "Work", "Project", "Certification", "Visa", "Personal"]);
const allowedStatuses = new Set(["Planned", "Active", "Completed", "Expired", "Cancelled"]);

function createRecordService(options) {
    const store = options.store;
    const uploadService = options.uploadService;

    function listRecords(userId) {
        return store.getRecordsByUserId(userId) || [];
    }

    function saveRecord(userId, body) {
        const record = sanitizeRecord(body);
        const validationError = validateRecord(record);
        if (validationError) {
            throw new AppError(400, validationError);
        }

        const existingRecord = (store.getRecordsByUserId(userId) || []).find(function(item) {
            return item.id === record.id;
        });

        if (
            existingRecord &&
            existingRecord.documentLink &&
            uploadService &&
            uploadService.isManagedDocumentLink(existingRecord.documentLink) &&
            existingRecord.documentLink !== record.documentLink
        ) {
            uploadService.deleteUserDocument(userId, existingRecord.documentLink);
        }

        store.saveRecordForUser(userId, record);
        return record;
    }

    function deleteRecord(userId, recordId) {
        const existingRecord = (store.getRecordsByUserId(userId) || []).find(function(record) {
            return record.id === recordId;
        });

        if (!existingRecord) {
            throw new AppError(404, "Record not found.");
        }

        if (existingRecord.documentLink && uploadService && uploadService.isManagedDocumentLink(existingRecord.documentLink)) {
            uploadService.deleteUserDocument(userId, existingRecord.documentLink);
        }

        store.deleteRecordForUser(userId, recordId);
        return { success: true };
    }

    function loadDemoData(userId) {
        return store.replaceRecordsForUser(userId, createSampleRecords()) || [];
    }

    function resetRecords(userId) {
        store.replaceRecordsForUser(userId, []);
        return [];
    }

    function removeRecordDocument(userId, recordId) {
        const existingRecord = (store.getRecordsByUserId(userId) || []).find(function(record) {
            return record.id === recordId;
        });

        if (!existingRecord) {
            throw new AppError(404, "Record not found.");
        }

        if (existingRecord.documentLink && uploadService && uploadService.isManagedDocumentLink(existingRecord.documentLink)) {
            uploadService.deleteUserDocument(userId, existingRecord.documentLink);
        }

        const updatedRecord = Object.assign({}, existingRecord, {
            documentName: "",
            documentLink: ""
        });

        store.saveRecordForUser(userId, updatedRecord);
        return updatedRecord;
    }

    return {
        listRecords,
        saveRecord,
        deleteRecord,
        loadDemoData,
        resetRecords,
        removeRecordDocument,
        createSampleRecords
    };
}

function sanitizeRecord(body) {
    const category = normalizeTextField(body.category, 30);
    const subtype = normalizeTextField(body.subtype, 50);
    const title = normalizeTextField(body.title, 120);
    const organization = normalizeTextField(body.organization, 120);
    const status = normalizeTextField(body.status || "Completed", 20);
    const location = normalizeTextField(body.location, 120);
    const documentName = normalizeTextField(body.documentName, 120);
    const documentLink = normalizeTextField(body.documentLink, 300);
    const description = normalizeTextField(body.description, 1000);
    const startDate = normalizeDate(body.startDate);
    const endDate = normalizeDate(body.endDate);
    const reminderDate = normalizeDate(body.reminderDate);
    const tags = Array.isArray(body.tags)
        ? body.tags.map(function(tag) {
            return normalizeTextField(tag, 30);
        }).filter(Boolean).slice(0, 12)
        : [];

    return {
        id: String(body.id || createId("rec")),
        category,
        subtype,
        title,
        organization,
        startDate,
        endDate,
        status,
        location,
        reminderDate,
        documentName,
        documentLink,
        tags,
        description
    };
}

function validateRecord(record) {
    if (!record.title || !record.category || !record.subtype || !record.startDate) {
        return "Category, type, title, and start date are required.";
    }

    if (!allowedCategories.has(record.category)) {
        return "Choose a valid category.";
    }

    if (!allowedStatuses.has(record.status)) {
        return "Choose a valid status.";
    }

    if (record.endDate && record.endDate < record.startDate) {
        return "End date cannot be earlier than start date.";
    }

    if (record.reminderDate && record.reminderDate < record.startDate) {
        return "Reminder date cannot be earlier than start date.";
    }

    return null;
}

function createSampleRecords() {
    return [
        {
            id: createId("rec"),
            category: "Education",
            subtype: "Bachelor's",
            title: "B.Tech in Computer Science",
            organization: "National Institute of Technology",
            startDate: "2016-06-01",
            endDate: "2020-05-20",
            status: "Completed",
            location: "Warangal, India",
            reminderDate: "",
            documentName: "Degree Certificate",
            documentLink: "Drive: degree-certificate.pdf",
            tags: ["degree", "transcript", "graduation"],
            description: "Completed undergraduate degree with internship proof, project summary, and academic transcripts."
        },
        {
            id: createId("rec"),
            category: "Work",
            subtype: "Full-Time",
            title: "Software Engineer",
            organization: "Fintech Platform",
            startDate: "2020-07-01",
            endDate: "2022-09-15",
            status: "Completed",
            location: "Hyderabad, India",
            reminderDate: "",
            documentName: "Experience Letter",
            documentLink: "Drive: experience-letter.pdf",
            tags: ["backend", "promotion", "node"],
            description: "Handled payment APIs, release automation, and internal admin tools."
        },
        {
            id: createId("rec"),
            category: "Visa",
            subtype: "H-1B",
            title: "H-1B Employment Status",
            organization: "USCIS / Employer Sponsor",
            startDate: "2023-10-01",
            endDate: "2026-09-30",
            status: "Active",
            location: "United States",
            reminderDate: "2026-08-15",
            documentName: "Approval Notice",
            documentLink: "Vault: h1b-approval-notice.pdf",
            tags: ["visa", "renewal", "immigration"],
            description: "Tracked petition approval, validity period, and upcoming renewal timeline."
        },
        {
            id: createId("rec"),
            category: "Certification",
            subtype: "AWS",
            title: "AWS Solutions Architect Associate",
            organization: "Amazon Web Services",
            startDate: "2024-03-10",
            endDate: "2027-03-10",
            status: "Active",
            location: "Online",
            reminderDate: "2027-01-15",
            documentName: "Certificate PDF",
            documentLink: "Cert: aws-saa.pdf",
            tags: ["cloud", "aws", "renewal"],
            description: "Saved certificate ID, exam date, and renewal reminder."
        }
    ];
}

function createId(prefix) {
    return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function normalizeTextField(value, maxLength) {
    return String(value || "").trim().slice(0, maxLength);
}

function normalizeDate(value) {
    const raw = String(value || "").trim();
    if (!raw) {
        return "";
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return "";
    }

    const date = new Date(`${raw}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) {
        return "";
    }

    return raw;
}

module.exports = {
    createRecordService
};
