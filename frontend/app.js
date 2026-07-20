const STORAGE_KEY = "scrapeflow_config";
const HISTORY_KEY = "scrapeflow_history";

function loadConfig() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) return JSON.parse(saved);
    } catch {}
    return {};
}

function saveConfig(config) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {}
}

function loadHistory() {
    try {
        const saved = localStorage.getItem(HISTORY_KEY);
        if (saved) return JSON.parse(saved);
    } catch {}
    return [];
}

function saveHistory(history) {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-20)));
    } catch {}
}

function getSelectors() {
    return {
        pat: document.getElementById("pat"),
        repo: document.getElementById("repo"),
        url: document.getElementById("url"),
        scraperType: document.getElementById("scraper-type"),
        outputFormat: document.getElementById("output-format"),
        customCss: document.getElementById("custom-css"),
        customCssGroup: document.getElementById("custom-css-group"),
        startBtn: document.getElementById("start-scrape"),
        btnText: document.querySelector(".btn-text"),
        btnLoading: document.querySelector(".btn-loading"),
        statusPanel: document.getElementById("status-panel"),
        dispatchStatus: document.getElementById("dispatch-status"),
        runStatus: document.getElementById("run-status"),
        runLink: document.getElementById("run-link"),
        runUrl: document.getElementById("run-url"),
        historyList: document.getElementById("history-list"),
    };
}

function updateStatus(element, status, value) {
    const dot = element.querySelector(".status-dot");
    const val = element.querySelector(".status-value");
    dot.className = "status-dot " + status;
    val.textContent = value;
}

async function githubApi(endpoint, token, method = "GET", body = null) {
    const headers = {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
    };

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    const resp = await fetch(`https://api.github.com${endpoint}`, opts);

    if (!resp.ok) {
        const errText = await resp.text();
        let err = {};
        try { err = JSON.parse(errText); } catch {}
        throw new Error(
            err.message || `HTTP ${resp.status}: ${resp.statusText}`
        );
    }

    const text = await resp.text();
    return text ? JSON.parse(text) : {};
}

async function detectRepo(pat) {
    const user = await githubApi("/user", pat);
    return user.login;
}

async function dispatchScrape(config) {
    const { pat, repo, url, scraperType, outputFormat, customCss } = config;

    const payload = {
        event_type: "run-scraper",
        client_payload: {
            url,
            scraper_type: scraperType,
            output_format: outputFormat,
            custom_css: customCss || "{}",
        },
    };

    return githubApi(`/repos/${repo}/dispatches`, pat, "POST", payload);
}

async function checkWorkflowRun(pat, repo) {
    const data = await githubApi(
        `/repos/${repo}/actions/runs?per_page=5`,
        pat
    );

    if (data.workflow_runs && data.workflow_runs.length > 0) {
        return data.workflow_runs[0];
    }

    return null;
}

function renderHistory(history, els) {
    if (!history.length) {
        els.historyList.innerHTML =
            '<p class="empty-state">No scrapes yet. Configure and run your first scrape above.</p>';
        return;
    }

    els.historyList.innerHTML = history
        .slice()
        .reverse()
        .map(
            (item) => `
        <div class="history-item">
            <span class="url" title="${escapeHtml(item.url)}">${escapeHtml(item.url)}</span>
            <div class="meta">
                <span class="status-badge dispatched">${escapeHtml(item.type)}</span>
                <span>${escapeHtml(item.time)}</span>
            </div>
        </div>
    `
        )
        .join("");
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function init() {
    const els = getSelectors();
    const config = loadConfig();
    const history = loadHistory();

    if (config.pat) els.pat.value = config.pat;
    if (config.repo) els.repo.value = config.repo;

    renderHistory(history, els);

    els.pat.addEventListener("blur", async () => {
        const pat = els.pat.value.trim();
        if (pat && pat.startsWith("ghp_") && !els.repo.value.trim()) {
            try {
                const username = await detectRepo(pat);
                els.repo.value = username + "/scrapeflow";
            } catch {}
        }
    });

    els.scraperType.addEventListener("change", () => {
        els.customCssGroup.style.display =
            els.scraperType.value === "custom" ? "block" : "none";
    });

    document.getElementById("toggle-pat").addEventListener("click", () => {
        els.pat.type = els.pat.type === "password" ? "text" : "password";
    });

    els.startBtn.addEventListener("click", async () => {
        const pat = els.pat.value.trim();
        const repo = els.repo.value.trim();
        const url = els.url.value.trim();

        if (!pat) {
            alert("Please enter your GitHub Personal Access Token.");
            els.pat.focus();
            return;
        }

        if (pat.startsWith("github_pat_")) {
            alert(
                "This looks like a Fine-grained token.\n\n"
                + "For this to work, you need a CLASSIC token instead:\n"
                + "1. Go to https://github.com/settings/tokens/new\n"
                + "2. Under 'Token name' type anything\n"
                + "3. Under 'Expiration' choose 30 days\n"
                + "4. Under 'Select scopes' check 'repo'\n"
                + "5. Click 'Generate token'\n"
                + "6. Copy the ghp_... token and paste here"
            );
            return;
        }

        if (!repo || !repo.includes("/")) {
            alert("Please enter a valid repository (format: owner/repo).");
            els.repo.focus();
            return;
        }

        if (!url) {
            alert("Please enter the target URL.");
            els.url.focus();
            return;
        }

        let customCss = "{}";
        if (els.scraperType.value === "custom") {
            customCss = els.customCss.value.trim() || "{}";
            try {
                JSON.parse(customCss);
            } catch {
                alert("Custom CSS selectors must be valid JSON.");
                els.customCss.focus();
                return;
            }
        }

        const scrapeConfig = {
            pat,
            repo,
            url,
            scraperType: els.scraperType.value,
            outputFormat: els.outputFormat.value,
            customCss,
        };

        saveConfig({ pat, repo });

        els.startBtn.disabled = true;
        els.btnText.style.display = "none";
        els.btnLoading.style.display = "inline";
        els.statusPanel.style.display = "block";

        updateStatus(els.dispatchStatus, "pending", "Sending...");

        try {
            await dispatchScrape(scrapeConfig);

            updateStatus(els.dispatchStatus, "success", "Dispatched!");
            updateStatus(els.runStatus, "pending", "Looking for run...");

            const entry = {
                url,
                type: scrapeConfig.scraperType,
                time: new Date().toLocaleTimeString(),
                timestamp: Date.now(),
            };
            history.push(entry);
            saveHistory(history);
            renderHistory(history, els);

            setTimeout(async () => {
                let run = null;
                for (let i = 0; i < 3; i++) {
                    try {
                        run = await checkWorkflowRun(pat, repo);
                        if (run) break;
                    } catch {}
                    await new Promise(r => setTimeout(r, 5000));
                }
                if (run) {
                    updateStatus(
                        els.runStatus,
                        "success",
                        `Run #${run.run_number} (${run.status})`
                    );
                    els.runLink.style.display = "block";
                    els.runUrl.href = run.html_url;
                } else {
                    updateStatus(
                        els.runStatus,
                        "pending",
                        "Check Actions tab manually"
                    );
                    els.runLink.style.display = "block";
                    els.runUrl.href = `https://github.com/${repo}/actions`;
                    els.runUrl.textContent = "View Actions →";
                }
            }, 10000);
        } catch (err) {
            updateStatus(els.dispatchStatus, "error", "Failed");
            let msg = err.message || "Unknown error";
            if (msg.includes("not accessible by personal access token")) {
                msg = "Token lacks permissions!\n\n"
                    + "Fix: Create a CLASSIC token (ghp_...):\n"
                    + "1. Go to https://github.com/settings/tokens/new\n"
                    + "2. Name it anything\n"
                    + "3. Check the 'repo' scope (all sub-items)\n"
                    + "4. Generate & paste the new ghp_... token";
            } else if (msg.includes("Not Found")) {
                msg = "Repository not found!\n\n"
                    + "Make sure:\n"
                    + "1. Repository format is: username/repo-name\n"
                    + "2. Your token has 'repo' scope\n"
                    + "3. The repository exists on GitHub\n\n"
                    + "Your token username: (check token works)";
            }
            alert("Dispatch failed: " + msg);
        } finally {
            els.startBtn.disabled = false;
            els.btnText.style.display = "inline";
            els.btnLoading.style.display = "none";
        }
    });
}

document.addEventListener("DOMContentLoaded", init);
