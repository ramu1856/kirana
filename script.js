const categoryOptions = {
    Document: [
        "ID Proof",
        "Education Document",
        "Job Document",
        "Visa Document",
        "Personal Document",
        "Certificate",
        "Resume",
        "Other"
    ],
    Education: [
        "High School",
        "Intermediate",
        "Diploma",
        "Bachelor's",
        "Master's",
        "MBA",
        "PhD",
        "Bootcamp",
        "Certification Course",
        "Internship",
        "Research",
        "Scholarship"
    ],
    Work: [
        "Full-Time",
        "Part-Time",
        "Internship",
        "Contract",
        "Freelance",
        "Consulting",
        "Promotion",
        "Role Change",
        "Relocation",
        "Experience Letter",
        "Resignation",
        "Founder Role"
    ],
    Project: [
        "Academic Project",
        "Client Project",
        "Open Source",
        "Startup MVP",
        "Hackathon",
        "AI Project",
        "Web App",
        "Mobile App",
        "Automation",
        "Research Build",
        "Portfolio Project",
        "Migration Project"
    ],
    Certification: [
        "AWS",
        "Azure",
        "GCP",
        "PMP",
        "Scrum",
        "Oracle",
        "Salesforce",
        "Cisco",
        "CompTIA",
        "Google",
        "Meta",
        "Coursera",
        "Udemy",
        "LinkedIn Learning"
    ],
    Visa: [
        "F-1",
        "OPT",
        "STEM OPT",
        "H-1B",
        "H-4",
        "L-1",
        "L-2",
        "B1/B2",
        "J-1",
        "J-2",
        "O-1",
        "TN",
        "PERM",
        "I-140",
        "Green Card",
        "Citizenship"
    ],
    Personal: [
        "Birth Record",
        "Address Change",
        "Marriage",
        "Dependent Added",
        "Travel History",
        "Volunteer Work",
        "Award",
        "Career Break",
        "Medical Leave",
        "Business Registration",
        "Home Purchase",
        "Relocation"
    ]
};

let records = [];
let currentUser = null;
let csrfToken = "";

const elements = {
    authMessage: document.getElementById("auth-message"),
    signupForm: document.getElementById("signup-form"),
    loginForm: document.getElementById("login-form"),
    forgotPasswordForm: document.getElementById("forgot-password-form"),
    resetPasswordForm: document.getElementById("reset-password-form"),
    verifyEmailForm: document.getElementById("verify-email-form"),
    resendVerificationForm: document.getElementById("resend-verification-form"),
    signupName: document.getElementById("signup-name"),
    signupEmail: document.getElementById("signup-email"),
    signupPassword: document.getElementById("signup-password"),
    loginEmail: document.getElementById("login-email"),
    loginPassword: document.getElementById("login-password"),
    forgotPasswordEmail: document.getElementById("forgot-password-email"),
    resetPasswordToken: document.getElementById("reset-password-token"),
    resetPasswordNew: document.getElementById("reset-password-new"),
    verifyEmailToken: document.getElementById("verify-email-token"),
    resendVerificationEmail: document.getElementById("resend-verification-email"),
    userBadge: document.getElementById("user-badge"),
    loadSampleBtn: document.getElementById("load-sample-btn"),
    resetDataBtn: document.getElementById("reset-data-btn"),
    logoutBtn: document.getElementById("logout-btn"),
    appSections: Array.from(document.querySelectorAll(".app-only")),
    heroTotalRecords: document.getElementById("hero-total-records"),
    heroTotalDocs: document.getElementById("hero-total-docs"),
    heroUpcomingReminders: document.getElementById("hero-upcoming-reminders"),
    heroCategoryCount: document.getElementById("hero-category-count"),
    totalRecords: document.getElementById("total-records"),
    totalDocuments: document.getElementById("total-documents"),
    totalReminders: document.getElementById("total-reminders"),
    openWorkRecords: document.getElementById("open-work-records"),
    categorySummary: document.getElementById("category-summary"),
    reminderList: document.getElementById("reminder-list"),
    typeCoverage: document.getElementById("type-coverage"),
    timelineList: document.getElementById("timeline-list"),
    documentList: document.getElementById("document-list"),
    timelineCount: document.getElementById("timeline-count"),
    searchHint: document.getElementById("search-hint"),
    reportSummary: document.getElementById("report-summary"),
    recordForm: document.getElementById("record-form"),
    saveRecordBtn: document.getElementById("save-record-btn"),
    recordId: document.getElementById("record-id"),
    formTitle: document.getElementById("form-title"),
    category: document.getElementById("category"),
    subtype: document.getElementById("subtype"),
    title: document.getElementById("title"),
    organization: document.getElementById("organization"),
    startDate: document.getElementById("start-date"),
    endDate: document.getElementById("end-date"),
    status: document.getElementById("status"),
    location: document.getElementById("location"),
    reminderDate: document.getElementById("reminder-date"),
    documentName: document.getElementById("document-name"),
    documentFile: document.getElementById("document-file"),
    documentStatus: document.getElementById("document-status"),
    documentLink: document.getElementById("document-link"),
    tags: document.getElementById("tags"),
    description: document.getElementById("description"),
    cancelEditBtn: document.getElementById("cancel-edit-btn"),
    searchInput: document.getElementById("search-input"),
    filterCategory: document.getElementById("filter-category"),
    filterStatus: document.getElementById("filter-status"),
    filterDocuments: document.getElementById("filter-documents"),
    printReportBtn: document.getElementById("print-report-btn")
};

initialize();

async function initialize() {
    renderCategorySelect();
    renderSubtypeSelect();
    renderTypeCoverage();
    renderFilterCategories();
    applyRecordDefaults();
    bindEvents();
    renderSearchHint(0, "");
    setAppVisibility(false);
    await hydrateSession();
}

function bindEvents() {
    elements.category.addEventListener("change", renderSubtypeSelect);
    elements.signupForm.addEventListener("submit", handleSignup);
    elements.loginForm.addEventListener("submit", handleLogin);
    elements.forgotPasswordForm.addEventListener("submit", handleForgotPassword);
    elements.resetPasswordForm.addEventListener("submit", handleResetPassword);
    elements.verifyEmailForm.addEventListener("submit", handleVerifyEmail);
    elements.resendVerificationForm.addEventListener("submit", handleResendVerification);
    elements.recordForm.addEventListener("submit", saveRecord);
    elements.cancelEditBtn.addEventListener("click", resetForm);
    elements.loadSampleBtn.addEventListener("click", loadDemoData);
    elements.resetDataBtn.addEventListener("click", resetUserData);
    elements.logoutBtn.addEventListener("click", logout);
    elements.searchInput.addEventListener("input", renderTimeline);
    elements.filterCategory.addEventListener("change", renderTimeline);
    elements.filterStatus.addEventListener("change", renderTimeline);
    elements.filterDocuments.addEventListener("change", renderTimeline);
    elements.documentFile.addEventListener("change", renderDocumentStatus);
    elements.printReportBtn.addEventListener("click", function() {
        window.print();
    });
}

async function hydrateSession() {
    try {
        const response = await api("/api/auth/me");
        currentUser = response.user;
        csrfToken = response.csrfToken || "";
        setAuthMessage(`Welcome back, ${currentUser.fullName}. Upload or download your saved documents anytime.`);
        setAppVisibility(true);
        await fetchRecords();
    } catch (error) {
        currentUser = null;
        records = [];
        csrfToken = "";
        setAuthMessage("Sign up or log in to upload documents and download them again later.");
        setAppVisibility(false);
        renderPublicStats();
    }
}

async function handleSignup(event) {
    event.preventDefault();

    try {
        const signupEmail = elements.signupEmail.value.trim();
        const response = await api("/api/auth/signup", {
            method: "POST",
            body: {
                fullName: elements.signupName.value.trim(),
                email: signupEmail,
                password: elements.signupPassword.value
            }
        });

        elements.signupForm.reset();
        elements.resendVerificationEmail.value = signupEmail;
        if (response.verificationToken) {
            elements.verifyEmailToken.value = response.verificationToken;
            setAuthMessage(`Account created. Verify your email before logging in. The token expires at ${formatDateTime(response.expiresAt)}.`);
        } else {
            setAuthMessage(response.message || "Account created. Verify your email before logging in.");
        }
        location.hash = "#auth";
    } catch (error) {
        setAuthMessage(error.message, true);
    }
}

async function handleLogin(event) {
    event.preventDefault();

    try {
        const response = await api("/api/auth/login", {
            method: "POST",
            body: {
                email: elements.loginEmail.value.trim(),
                password: elements.loginPassword.value
            }
        });

        currentUser = response.user;
        csrfToken = response.csrfToken || "";
        elements.loginForm.reset();
        setAuthMessage(`Logged in as ${currentUser.fullName}. You can now upload or download your documents.`);
        setAppVisibility(true);
        await fetchRecords();
        location.hash = "#add-record";
    } catch (error) {
        setAuthMessage(error.message, true);
    }
}

async function logout() {
    try {
        await api("/api/auth/logout", { method: "POST" });
    } catch (error) {
        // Ignore logout errors and still clear the UI state.
    }

    currentUser = null;
    records = [];
    csrfToken = "";
    resetForm();
    setAppVisibility(false);
    renderPublicStats();
    setAuthMessage("You have been logged out.");
    location.hash = "#auth";
}

async function handleForgotPassword(event) {
    event.preventDefault();

    try {
        const response = await api("/api/auth/forgot-password", {
            method: "POST",
            body: {
                email: elements.forgotPasswordEmail.value.trim()
            }
        });

        elements.forgotPasswordForm.reset();
        if (response.resetToken) {
            elements.resetPasswordToken.value = response.resetToken;
            setAuthMessage(`Reset link created. It expires at ${formatDateTime(response.expiresAt)}. Use the token below or the generated link from the local outbox.`);
        } else {
            setAuthMessage(response.message || "If an account exists for that email, a reset token has been created.");
        }
    } catch (error) {
        setAuthMessage(error.message, true);
    }
}

async function handleResetPassword(event) {
    event.preventDefault();

    try {
        const response = await api("/api/auth/reset-password", {
            method: "POST",
            body: {
                token: elements.resetPasswordToken.value.trim(),
                newPassword: elements.resetPasswordNew.value
            }
        });

        elements.resetPasswordForm.reset();
        setAuthMessage(response.message || "Password updated successfully. You can log in now.");
    } catch (error) {
        setAuthMessage(error.message, true);
    }
}

async function handleVerifyEmail(event) {
    event.preventDefault();

    try {
        const response = await api("/api/auth/verify-email", {
            method: "POST",
            body: {
                token: elements.verifyEmailToken.value.trim()
            }
        });

        elements.verifyEmailForm.reset();
        setAuthMessage(response.message || "Email verified successfully. You can log in now.");
    } catch (error) {
        setAuthMessage(error.message, true);
    }
}

async function handleResendVerification(event) {
    event.preventDefault();

    try {
        const response = await api("/api/auth/resend-verification", {
            method: "POST",
            body: {
                email: elements.resendVerificationEmail.value.trim()
            }
        });

        if (response.verificationToken) {
            elements.verifyEmailToken.value = response.verificationToken;
            setAuthMessage(`Verification link created. It expires at ${formatDateTime(response.expiresAt)}.`);
        } else {
            setAuthMessage(response.message || "If an unverified account exists for that email, a verification link has been created.");
        }
    } catch (error) {
        setAuthMessage(error.message, true);
    }
}

applyAuthTokensFromHash();

async function fetchRecords() {
    const response = await api("/api/records");
    records = Array.isArray(response.records) ? response.records : [];
    resetForm();
    renderApp();
}

async function loadDemoData() {
    try {
        const response = await api("/api/records/demo-load", { method: "POST" });
        records = response.records || [];
        resetForm();
        renderApp();
        setAuthMessage("Demo data loaded into your account.");
    } catch (error) {
        setAuthMessage(error.message, true);
    }
}

async function resetUserData() {
    try {
        const response = await api("/api/records/reset", { method: "POST" });
        records = response.records || [];
        resetForm();
        renderApp();
        setAuthMessage("All records in your account were cleared.");
    } catch (error) {
        setAuthMessage(error.message, true);
    }
}

async function saveRecord(event) {
    event.preventDefault();

    const record = {
        id: elements.recordId.value || createId(),
        category: elements.category.value || "Document",
        subtype: elements.subtype.value || "Other",
        title: elements.title.value.trim(),
        organization: elements.organization.value.trim(),
        startDate: elements.startDate.value || getTodayDateValue(),
        endDate: elements.endDate.value,
        status: elements.status.value || "Active",
        location: elements.location.value.trim(),
        reminderDate: elements.reminderDate.value,
        documentName: elements.documentName.value.trim(),
        documentLink: elements.documentLink.value.trim(),
        tags: elements.tags.value.split(",").map(function(tag) {
            return tag.trim();
        }).filter(Boolean),
        description: elements.description.value.trim()
    };

    try {
        setRecordSavingState(true, "Saving document...");
        if (elements.documentFile.files && elements.documentFile.files[0]) {
            setRecordSavingState(true, "Uploading file...");
            const uploadedDocument = await uploadSelectedDocument(elements.documentFile.files[0]);
            record.documentName = record.documentName || uploadedDocument.documentName;
            record.documentLink = uploadedDocument.documentLink;
            setRecordSavingState(true, "Saving document...");
        }

        await api("/api/records", {
            method: "POST",
            body: record
        });
        await fetchRecords();
        setAuthMessage("Document saved to your account. Log in anytime later to download it again.");
        location.hash = "#timeline";
    } catch (error) {
        setAuthMessage(error.message, true);
    } finally {
        setRecordSavingState(false);
    }
}

function renderCategorySelect() {
    const categories = Object.keys(categoryOptions);
    elements.category.innerHTML = categories.map(function(categoryName) {
        return `<option value="${categoryName}">${categoryName}</option>`;
    }).join("");
    elements.category.value = "Document";
}

function renderSubtypeSelect() {
    const selectedCategory = elements.category.value || Object.keys(categoryOptions)[0];
    const subtypeOptions = categoryOptions[selectedCategory];
    elements.subtype.innerHTML = subtypeOptions.map(function(option) {
        return `<option value="${option}">${option}</option>`;
    }).join("");
}

function renderTypeCoverage() {
    if (!elements.typeCoverage) {
        return;
    }

    elements.typeCoverage.innerHTML = Object.keys(categoryOptions).map(function(categoryName) {
        return `
            <article class="coverage-chip">
                <h4>${categoryName}</h4>
                <p>${categoryOptions[categoryName].slice(0, 4).join(", ")}${categoryOptions[categoryName].length > 4 ? "..." : ""}</p>
            </article>
        `;
    }).join("");
}

function renderFilterCategories() {
    const categories = ["All"].concat(Object.keys(categoryOptions));
    elements.filterCategory.innerHTML = categories.map(function(categoryName) {
        return `<option value="${categoryName}">${categoryName}</option>`;
    }).join("");
}

function setAppVisibility(isVisible) {
    elements.appSections.forEach(function(section) {
        section.classList.toggle("hidden", !isVisible);
    });
    elements.userBadge.classList.toggle("hidden", !isVisible);
    elements.loadSampleBtn.classList.add("hidden");
    elements.resetDataBtn.classList.toggle("hidden", !isVisible);
    elements.logoutBtn.classList.toggle("hidden", !isVisible);

    if (isVisible && currentUser) {
        elements.userBadge.textContent = `${currentUser.fullName} (${currentUser.email})`;
    } else {
        elements.userBadge.textContent = "";
    }
}

function applyRecordDefaults() {
    if (elements.category) {
        elements.category.value = "Document";
    }
    renderSubtypeSelect();
    if (elements.subtype) {
        elements.subtype.value = "Other";
    }
    if (elements.status) {
        elements.status.value = "Active";
    }
    if (elements.startDate && !elements.startDate.value) {
        elements.startDate.value = getTodayDateValue();
    }
}

function setAuthMessage(message, isError) {
    elements.authMessage.textContent = message;
    elements.authMessage.style.color = isError ? "var(--danger)" : "";
}

function getTodayDateValue() {
    return new Date().toISOString().slice(0, 10);
}

function setRecordSavingState(isSaving, label) {
    elements.saveRecordBtn.disabled = isSaving;
    elements.documentFile.disabled = isSaving;
    elements.cancelEditBtn.disabled = isSaving;
    elements.saveRecordBtn.textContent = isSaving ? (label || "Saving...") : "Save Document";
}

function renderPublicStats() {
    const totalCategories = Object.keys(categoryOptions).length;
    elements.heroTotalRecords.textContent = "0";
    elements.heroTotalDocs.textContent = "0";
    elements.heroUpcomingReminders.textContent = "0";
    elements.heroCategoryCount.textContent = String(totalCategories);
}

function resetForm() {
    elements.recordForm.reset();
    elements.recordId.value = "";
    elements.formTitle.textContent = "Quick Document Submit";
    elements.cancelEditBtn.classList.add("hidden");
    renderCategorySelect();
    renderSubtypeSelect();
    applyRecordDefaults();
    renderDocumentStatus();
}

async function uploadSelectedDocument(file) {
    const contentBase64 = await readFileAsBase64(file);
    return api("/api/uploads", {
        method: "POST",
        body: {
            fileName: file.name,
            contentBase64
        }
    });
}

function renderApp() {
    renderDashboard();
    renderTimeline();
    renderDocuments();
    renderReport();
}

function renderDashboard() {
    const totalDocs = records.filter(hasDocument).length;
    const upcomingReminders = getUpcomingReminders();
    const openWorkRecords = records.filter(function(record) {
        return record.category === "Work" && record.status === "Active";
    }).length;

    elements.heroTotalRecords.textContent = String(records.length);
    elements.heroTotalDocs.textContent = String(totalDocs);
    elements.heroUpcomingReminders.textContent = String(upcomingReminders.length);
    elements.heroCategoryCount.textContent = String(Object.keys(categoryOptions).length);

    elements.totalRecords.textContent = String(records.length);
    elements.totalDocuments.textContent = String(totalDocs);
    elements.totalReminders.textContent = String(upcomingReminders.length);
    elements.openWorkRecords.textContent = String(openWorkRecords);

    renderCategorySummary();
    renderReminderPanel(upcomingReminders);
}

function renderCategorySummary() {
    const categories = Object.keys(categoryOptions);
    elements.categorySummary.innerHTML = categories.map(function(categoryName) {
        const count = records.filter(function(record) {
            return record.category === categoryName;
        }).length;
        return `
            <div class="summary-row">
                <span>${categoryName}</span>
                <strong>${count}</strong>
            </div>
        `;
    }).join("");
}

function renderReminderPanel(reminders) {
    if (!reminders.length) {
        elements.reminderList.innerHTML = '<div class="empty-state">No reminders yet. Add a reminder date to visa, certification, or document records.</div>';
        return;
    }

    elements.reminderList.innerHTML = reminders.map(function(record) {
        return `
            <div class="stack-item">
                <strong>${escapeHtml(record.title)}</strong>
                <p>${escapeHtml(record.category)} / ${escapeHtml(record.subtype)}</p>
                <p>Reminder: ${formatDate(record.reminderDate)}</p>
            </div>
        `;
    }).join("");
}

function getFilteredRecords() {
    const search = normalizeText(elements.searchInput.value.trim());
    const searchTerms = search.split(/\s+/).filter(Boolean);
    const categoryFilter = elements.filterCategory.value;
    const statusFilter = elements.filterStatus.value;
    const documentFilter = elements.filterDocuments.value;

    return records
        .filter(function(record) {
            const searchableText = buildSearchIndex(record);
            const matchesSearch = !searchTerms.length || searchTerms.every(function(term) {
                return searchableText.includes(term);
            });

            const matchesCategory = categoryFilter === "All" || record.category === categoryFilter;
            const matchesStatus = statusFilter === "All" || record.status === statusFilter;
            const matchesDocuments =
                documentFilter === "All" ||
                (documentFilter === "With Documents" && hasDocument(record)) ||
                (documentFilter === "Without Documents" && !hasDocument(record));

            return matchesSearch && matchesCategory && matchesStatus && matchesDocuments;
        })
        .sort(function(a, b) {
            return (b.startDate || "").localeCompare(a.startDate || "");
        });
}

function renderTimeline() {
    const filtered = getFilteredRecords();
    const rawSearch = elements.searchInput.value.trim();
    elements.timelineCount.textContent = `${filtered.length} record${filtered.length === 1 ? "" : "s"}`;
    renderSearchHint(filtered.length, rawSearch);

    if (!filtered.length) {
        elements.timelineList.innerHTML = '<div class="empty-state">No records match the current search and filters.</div>';
        return;
    }

    elements.timelineList.innerHTML = filtered.map(function(record) {
        return `
            <article class="timeline-item">
                <div class="timeline-meta">
                    <div class="timeline-badges">
                        <span class="badge">${escapeHtml(record.category)}</span>
                        <span class="badge">${escapeHtml(record.subtype)}</span>
                        <span class="badge">${escapeHtml(record.status)}</span>
                    </div>
                    <span>${formatRange(record.startDate, record.endDate)}</span>
                </div>
                <div class="timeline-content">
                    <h4>${escapeHtml(record.title)}</h4>
                    <p>${escapeHtml(record.organization || "No organization provided")} / ${escapeHtml(record.location || "No location provided")}</p>
                    <p>${escapeHtml(record.description || "No description added yet.")}</p>
                    ${renderDocumentSummary(record)}
                    ${record.reminderDate ? `<p><strong>Reminder:</strong> ${formatDate(record.reminderDate)}</p>` : ""}
                    <div class="tag-list">${(record.tags || []).map(function(tag) { return `<span>${escapeHtml(tag)}</span>`; }).join("")}</div>
                </div>
                <div class="timeline-actions">
                    <button class="timeline-action-btn" type="button" onclick="editRecord('${record.id}')">Edit</button>
                    ${hasManagedDocument(record) ? `<button class="timeline-action-btn" type="button" onclick="removeRecordDocument('${record.id}')">Remove File</button>` : ""}
                    <button class="timeline-action-btn delete-btn" type="button" onclick="deleteRecord('${record.id}')">Delete</button>
                </div>
            </article>
        `;
    }).join("");
}

function renderDocuments() {
    const documentRecords = records.filter(hasDocument);
    if (!documentRecords.length) {
        elements.documentList.innerHTML = '<div class="empty-state">No documents stored yet. Upload a file now and it will appear here for later download.</div>';
        return;
    }

    elements.documentList.innerHTML = documentRecords.map(function(record) {
        return `
            <div class="stack-item">
                <strong>${escapeHtml(record.documentName || "Document")}</strong>
                <p>${escapeHtml(record.title)} / ${escapeHtml(record.category)} / ${escapeHtml(record.subtype)}</p>
                <p>${renderDocumentAccess(record)}</p>
                ${renderDocumentPreview(record)}
                ${hasManagedDocument(record) ? `<div class="form-actions"><button class="timeline-action-btn delete-btn" type="button" onclick="removeRecordDocument('${record.id}')">Delete File</button></div>` : ""}
            </div>
        `;
    }).join("");
}

function renderSearchHint(resultCount, searchText) {
    if (!searchText) {
    elements.searchHint.textContent = "Search by document name, category, file label, tags, source, or dates.";
        return;
    }

    elements.searchHint.textContent = `Searching for "${searchText}" across all saved details. Found ${resultCount} matching record${resultCount === 1 ? "" : "s"}.`;
}

function renderReport() {
    const categories = Object.keys(categoryOptions);
    const totalDocs = records.filter(hasDocument).length;
    const reminders = getUpcomingReminders().length;
    const activeRecords = records.filter(function(record) {
        return record.status === "Active";
    }).length;

    const blocks = [
        {
            title: "Overview",
            body: `
                <p>Total records stored: <strong>${records.length}</strong></p>
                <p>Documents linked: <strong>${totalDocs}</strong></p>
                <p>Upcoming reminders: <strong>${reminders}</strong></p>
                <p>Currently active records: <strong>${activeRecords}</strong></p>
            `
        },
        {
            title: "Category Breakdown",
            body: `
                <ul>
                    ${categories.map(function(categoryName) {
                        const count = records.filter(function(record) {
                            return record.category === categoryName;
                        }).length;
                        return `<li>${categoryName}: ${count}</li>`;
                    }).join("")}
                </ul>
            `
        },
        {
            title: "Recent Timeline Highlights",
            body: `
                <ul>
                    ${records
                        .slice()
                        .sort(function(a, b) {
                            return (b.startDate || "").localeCompare(a.startDate || "");
                        })
                        .slice(0, 5)
                        .map(function(record) {
                            return `<li>${escapeHtml(record.title)} (${escapeHtml(record.category)} / ${formatRange(record.startDate, record.endDate)})</li>`;
                        }).join("")}
                </ul>
            `
        },
        {
            title: "Verification Readiness",
            body: `
                <p>This account stores education history, work history, projects, certifications, visa records, and personal events in one structured format.</p>
                <p>Use linked documents, reminder dates, and descriptions as supporting evidence for interviews, onboarding, immigration filings, and background verification.</p>
            `
        }
    ];

    elements.reportSummary.innerHTML = blocks.map(function(block) {
        return `
            <section class="report-block">
                <div class="report-block-header">
                    <h4>${block.title}</h4>
                </div>
                ${block.body}
            </section>
        `;
    }).join("");
}

function getUpcomingReminders() {
    const today = new Date();
    const limit = new Date();
    limit.setDate(today.getDate() + 60);

    return records
        .filter(function(record) {
            if (!record.reminderDate) {
                return false;
            }
            const date = new Date(record.reminderDate);
            return date >= today && date <= limit;
        })
        .sort(function(a, b) {
            return a.reminderDate.localeCompare(b.reminderDate);
        });
}

function hasDocument(record) {
    return Boolean(record.documentName || record.documentLink);
}

function hasManagedDocument(record) {
    return String(record.documentLink || "").startsWith("/uploads/");
}

function renderDocumentSummary(record) {
    if (!hasDocument(record)) {
        return "";
    }

    return `<p><strong>Document:</strong> ${renderDocumentAccess(record)}</p>`;
}

function renderDocumentAccess(record) {
    const name = escapeHtml(record.documentName || "Attached document");
    const link = String(record.documentLink || "").trim();
    if (!link) {
        return name;
    }

    const safeHref = escapeAttribute(link);
    return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${name}</a>`;
}

function renderDocumentPreview(record) {
    const link = String(record.documentLink || "").trim();
    if (!link || !hasManagedDocument(record)) {
        return "";
    }

    const safeHref = escapeAttribute(link);
    const lowerName = String(record.documentName || link).toLowerCase();

    if (/\.(png|jpg|jpeg|gif|webp)$/.test(lowerName)) {
        return `<img class="document-preview-image" src="${safeHref}" alt="${escapeAttribute(record.documentName || "Document preview")}">`;
    }

    if (/\.pdf$/.test(lowerName)) {
        return `<iframe class="document-preview-frame" src="${safeHref}" title="${escapeAttribute(record.documentName || "Document preview")}"></iframe>`;
    }

    return "";
}

function buildSearchIndex(record) {
    const searchParts = [
        record.category,
        record.subtype,
        record.title,
        record.organization,
        record.location,
        record.status,
        record.description,
        record.documentName,
        record.documentLink,
        record.startDate,
        record.endDate,
        record.reminderDate,
        formatDate(record.startDate),
        formatDate(record.endDate),
        formatDate(record.reminderDate),
        (record.tags || []).join(" ")
    ];

    return normalizeText(searchParts.filter(Boolean).join(" "));
}

function normalizeText(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^\w\s/-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function createId() {
    return "rec-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
}

function formatRange(startDate, endDate) {
    const start = startDate ? formatDate(startDate) : "No start date";
    const end = endDate ? formatDate(endDate) : "Present";
    return `${start} to ${end}`;
}

function formatDate(value) {
    if (!value) {
        return "N/A";
    }
    const date = new Date(value + "T00:00:00");
    return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}

function formatDateTime(value) {
    if (!value) {
        return "N/A";
    }

    const date = new Date(value);
    return date.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });
}

function readFileAsBase64(file) {
    return new Promise(function(resolve, reject) {
        const reader = new FileReader();
        reader.onload = function() {
            const result = String(reader.result || "");
            const base64 = result.includes(",") ? result.split(",")[1] : "";
            if (!base64) {
                reject(new Error("Could not read the selected file."));
                return;
            }
            resolve(base64);
        };
        reader.onerror = function() {
            reject(new Error("Could not read the selected file."));
        };
        reader.readAsDataURL(file);
    });
}

function applyAuthTokensFromHash() {
    if (location.hash.startsWith("#auth-reset")) {
        applyResetTokenFromHash();
        return;
    }

    if (location.hash.startsWith("#auth-verify")) {
        applyVerificationTokenFromHash();
    }
}

function applyResetTokenFromHash() {
    if (!location.hash.startsWith("#auth-reset")) {
        return;
    }

    const hash = location.hash.slice(1);
    const queryIndex = hash.indexOf("?");
    if (queryIndex === -1) {
        return;
    }

    const params = new URLSearchParams(hash.slice(queryIndex + 1));
    const token = params.get("token");
    if (!token) {
        return;
    }

    elements.resetPasswordToken.value = token;
    location.hash = "#auth";
    setAuthMessage("Reset token loaded from the reset link. Enter your new password to continue.");
}

function applyVerificationTokenFromHash() {
    const hash = location.hash.slice(1);
    const queryIndex = hash.indexOf("?");
    if (queryIndex === -1) {
        return;
    }

    const params = new URLSearchParams(hash.slice(queryIndex + 1));
    const token = params.get("token");
    if (!token) {
        return;
    }

    elements.verifyEmailToken.value = token;
    location.hash = "#auth";
    setAuthMessage("Verification token loaded from the email link. Submit the form to finish verifying your account.");
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function escapeAttribute(text) {
    return escapeHtml(text);
}

async function api(url, options) {
    const method = options && options.method ? options.method : "GET";
    const headers = {
        "Content-Type": "application/json"
    };

    if (method !== "GET" && method !== "HEAD" && csrfToken) {
        headers["X-CSRF-Token"] = csrfToken;
    }

    const response = await fetch(url, {
        method,
        headers,
        body: options && options.body ? JSON.stringify(options.body) : undefined,
        credentials: "same-origin"
    });

    const data = await response.json().catch(function() {
        return {};
    });

    if (!response.ok) {
        throw new Error(data.error || "Request failed.");
    }

    return data;
}

window.editRecord = function(recordId) {
    const record = records.find(function(item) {
        return item.id === recordId;
    });

    if (!record) {
        return;
    }

    elements.recordId.value = record.id;
    elements.category.value = record.category;
    renderSubtypeSelect();
    elements.subtype.value = record.subtype;
    elements.title.value = record.title;
    elements.organization.value = record.organization;
    elements.startDate.value = record.startDate;
    elements.endDate.value = record.endDate;
    elements.status.value = record.status;
    elements.location.value = record.location;
    elements.reminderDate.value = record.reminderDate;
    elements.documentName.value = record.documentName;
    elements.documentLink.value = record.documentLink;
    elements.tags.value = (record.tags || []).join(", ");
    elements.description.value = record.description;
    elements.formTitle.textContent = "Edit Saved Document";
    elements.cancelEditBtn.classList.remove("hidden");
    renderDocumentStatus(record);
    location.hash = "#add-record";
}

function renderDocumentStatus(record) {
    const activeRecord = record || getActiveEditRecord();
    const selectedFile = elements.documentFile.files && elements.documentFile.files[0];

    if (!activeRecord && !selectedFile) {
        elements.documentStatus.classList.add("hidden");
        elements.documentStatus.innerHTML = "";
        return;
    }

    const currentAttachment = activeRecord && activeRecord.documentLink
        ? `
            <div class="document-status-block">
                <span class="document-status-label">Current attachment</span>
                <a href="${escapeAttribute(activeRecord.documentLink)}" target="_blank" rel="noopener noreferrer">${escapeHtml(activeRecord.documentName || activeRecord.documentLink)}</a>
            </div>
        `
        : `
            <div class="document-status-block">
                <span class="document-status-label">Current attachment</span>
                <span>No file attached yet.</span>
            </div>
        `;

    const replacementNotice = selectedFile
        ? `
            <div class="document-status-block">
                <span class="document-status-label">Selected file</span>
                <strong>${escapeHtml(selectedFile.name)}</strong>
                <span>This file will upload when you save and replace the current managed upload.</span>
            </div>
        `
        : `
            <div class="document-status-block">
                <span class="document-status-label">Upload behavior</span>
                <span>Choose a file here to replace the current managed upload when you save.</span>
            </div>
        `;

    elements.documentStatus.innerHTML = `${currentAttachment}${replacementNotice}`;
    elements.documentStatus.classList.remove("hidden");
}

function getActiveEditRecord() {
    if (!elements.recordId.value) {
        return null;
    }

    return records.find(function(record) {
        return record.id === elements.recordId.value;
    }) || null;
}

window.deleteRecord = async function(recordId) {
    const confirmed = window.confirm("Delete this record and any managed uploaded file attached to it?");
    if (!confirmed) {
        return;
    }

    try {
        await api(`/api/records/${encodeURIComponent(recordId)}`, {
            method: "DELETE"
        });
        await fetchRecords();
        setAuthMessage("Record deleted from your account.");
    } catch (error) {
        setAuthMessage(error.message, true);
    }
};

window.removeRecordDocument = async function(recordId) {
    const confirmed = window.confirm("Remove the attached managed file from this record?");
    if (!confirmed) {
        return;
    }

    try {
        await api(`/api/records/${encodeURIComponent(recordId)}/document`, {
            method: "DELETE"
        });
        await fetchRecords();
        setAuthMessage("Document removed from the record.");
    } catch (error) {
        setAuthMessage(error.message, true);
    }
};
