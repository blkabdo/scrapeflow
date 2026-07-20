const STORAGE_KEY = "scrapeflow_config";
const HISTORY_KEY = "scrapeflow_history";

function log(msg) {
    const el = document.getElementById("debug-log");
    if (el) {
        el.style.display = "block";
        el.textContent += new Date().toLocaleTimeString() + " > " + msg + "\n";
        el.scrollTop = el.scrollHeight;
    }
}

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

async function githubApi(endpoint, token, method, body) {
    const url = "https://api.github.com" + endpoint;
    const headers = {
        "Authorization": "token " + token,
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
    };

    log("API " + method + " " + url);

    const opts = { method: method || "GET", headers: headers };
    if (body) opts.body = JSON.stringify(body);

    const resp = await fetch(url, opts);
    const text = await resp.text();

    log("Response " + resp.status + " len=" + text.length);

    if (!resp.ok) {
        let errMsg = "HTTP " + resp.status;
        try {
            const parsed = JSON.parse(text);
            if (parsed.message) errMsg = parsed.message;
        } catch {}
        throw new Error(errMsg);
    }

    return text ? JSON.parse(text) : {};
}

async function dispatchScrape(config) {
    const payload = {
        event_type: "run-scraper",
        client_payload: {
            url: config.url,
            scraper_type: config.scraperType,
            output_format: config.outputFormat,
            custom_css: config.customCss || "{}",
        },
    };

    log("Dispatching to repo: " + config.repo);

    return githubApi("/repos/" + config.repo + "/dispatches", config.pat, "POST", payload);
}

async function checkWorkflowRun(pat, repo) {
    const data = await githubApi(
        "/repos/" + repo + "/actions/runs?per_page=5",
        pat, "GET"
    );

    if (data.workflow_runs && data.workflow_runs.length > 0) {
        return data.workflow_runs[0];
    }

    return null;
}

function renderHistory(history, els) {
    if (!history.length) {
        els.historyList.innerHTML =
            '<p class="empty-state">No scrapes yet.</p>';
        return;
    }

    els.historyList.innerHTML = history
        .slice()
        .reverse()
        .map(function(item) {
            return '<div class="history-item">'
                + '<span class="url" title="' + escapeHtml(item.url) + '">' + escapeHtml(item.url) + '</span>'
                + '<div class="meta">'
                + '<span class="status-badge dispatched">' + escapeHtml(item.type) + '</span>'
                + '<span>' + escapeHtml(item.time) + '</span>'
                + '</div></div>';
        })
        .join("");
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
}

function init() {
    const els = getSelectors();
    var history = loadHistory();

    renderHistory(history, els);

    els.scraperType.addEventListener("change", function() {
        els.customCssGroup.style.display =
            els.scraperType.value === "custom" ? "block" : "none";
    });

    document.getElementById("toggle-pat").addEventListener("click", function() {
        els.pat.type = els.pat.type === "password" ? "text" : "password";
    });

    els.startBtn.addEventListener("click", async function() {
        var pat = els.pat.value.trim();
        var repo = els.repo.value.trim();
        var url = els.url.value.trim();

        var debugEl = document.getElementById("debug-log");
        if (debugEl) {
            debugEl.style.display = "block";
            debugEl.textContent = "";
        }

        log("Token: " + (pat ? pat.substring(0, 8) + "..." : "EMPTY"));
        log("Repo: " + (repo || "EMPTY"));
        log("URL: " + (url || "EMPTY"));

        if (!pat) {
            alert("Enter your GitHub token.");
            return;
        }

        if (pat.startsWith("github_pat_")) {
            alert("Use a Classic token (ghp_...) not Fine-grained.\nhttps://github.com/settings/tokens/new");
            return;
        }

        if (!repo || repo.indexOf("/") === -1) {
            alert("Enter repository as: owner/repo-name");
            return;
        }

        if (!url) {
            alert("Enter the URL to scrape.");
            return;
        }

        var customCss = "{}";
        if (els.scraperType.value === "custom") {
            customCss = els.customCss.value.trim() || "{}";
            try { JSON.parse(customCss); } catch {
                alert("Custom CSS must be valid JSON.");
                return;
            }
        }

        var scrapeConfig = {
            pat: pat,
            repo: repo,
            url: url,
            scraperType: els.scraperType.value,
            outputFormat: els.outputFormat.value,
            customCss: customCss,
        };

        saveConfig({ pat: pat, repo: repo });

        els.startBtn.disabled = true;
        els.btnText.style.display = "none";
        els.btnLoading.style.display = "inline";
        els.statusPanel.style.display = "block";

        updateStatus(els.dispatchStatus, "pending", "Sending...");

        try {
            await dispatchScrape(scrapeConfig);

            updateStatus(els.dispatchStatus, "success", "Dispatched!");
            log("Dispatch OK");
            updateStatus(els.runStatus, "pending", "Looking for run...");

            var entry = {
                url: url,
                type: scrapeConfig.scraperType,
                time: new Date().toLocaleTimeString(),
                timestamp: Date.now(),
            };
            history.push(entry);
            saveHistory(history);
            renderHistory(history, els);

            setTimeout(async function() {
                var run = null;
                for (var i = 0; i < 3; i++) {
                    try {
                        run = await checkWorkflowRun(pat, repo);
                        if (run) break;
                    } catch (e) { log("Check error: " + e.message); }
                    if (i < 2) await new Promise(function(r) { setTimeout(r, 5000); });
                }
                if (run) {
                    updateStatus(els.runStatus, "success", "Run #" + run.run_number + " (" + run.status + ")");
                    els.runLink.style.display = "block";
                    els.runUrl.href = run.html_url;
                } else {
                    updateStatus(els.runStatus, "pending", "Check Actions tab");
                    els.runLink.style.display = "block";
                    els.runUrl.href = "https://github.com/" + repo + "/actions";
                    els.runUrl.textContent = "View Actions";
                }
            }, 10000);

        } catch (err) {
            updateStatus(els.dispatchStatus, "error", "Failed");
            log("Error: " + err.message);
            alert("Dispatch failed: " + err.message);
        } finally {
            els.startBtn.disabled = false;
            els.btnText.style.display = "inline";
            els.btnLoading.style.display = "none";
        }
    });
}

document.addEventListener("DOMContentLoaded", init);
