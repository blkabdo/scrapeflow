# ScrapeFlow

Free & open-source web scraping platform powered by GitHub Actions. No server needed.

## How It Works

```
[Frontend (GitHub Pages)] --API--> [GitHub Actions] --> [Python + Playwright] --> [Results]
```

1. You enter a URL and scraper type in the web UI
2. The UI sends a `repository_dispatch` event to GitHub via API
3. GitHub Actions picks up the event and runs a Python scraper with Playwright
4. Results are saved as CSV/JSON and uploaded as artifacts + GitHub Release

## Setup (5 minutes)

### 1. Fork this repo

Click **Fork** at the top of this page.

### 2. Enable GitHub Pages

- Go to your fork > **Settings** > **Pages**
- Source: **Deploy from a branch**
- Branch: `main`, folder: `/frontend`
- Click **Save**

### 3. Create a Personal Access Token

- Go to [github.com/settings/tokens](https://github.com/settings/tokens)
- Click **Generate new token (classic)**
- Name it anything (e.g., "scrapeflow")
- Select scope: **repo** (Full control of private repositories)
- Click **Generate token**
- Copy the token (`ghp_...`)

### 4. Use the app

Open your GitHub Pages URL (e.g., `https://yourname.github.io/scrapeflow/`) and:

1. Paste your PAT
2. Enter your repo (e.g., `yourname/scrapeflow`)
3. Enter the URL to scrape
4. Choose scraper type and output format
5. Click **Start Scraping**

Results appear in the repo's **Actions** tab as artifacts and releases.

## Scraper Types

| Type | Description |
|------|-------------|
| `generic` | Extracts title, description, links, images, meta tags |
| `product` | Extracts product name, price, description, images, rating |
| `news` | Extracts headline, body text, author, date, images |
| `table` | Extracts all HTML tables into structured rows |
| `custom` | Use your own CSS selectors as JSON |

### Custom CSS Example

```json
{
  "title": "h1.product-title",
  "price": ".price-value",
  "description": "#product-desc",
  "images": ".gallery img"
}
```

## Project Structure

```
.
├── .github/workflows/
│   └── scrape.yml          # GitHub Actions workflow
├── engine/
│   └── scraper.py          # Python scraping engine (Playwright)
├── frontend/
│   ├── index.html           # Web UI
│   ├── style.css            # Styles
│   └── app.js               # Frontend logic
├── scrapers/
│   └── examples.py          # Example scraper scripts
├── requirements.txt
└── README.md
```

## Running Locally

```bash
pip install -r requirements.txt
playwright install chromium
python engine/scraper.py --url https://example.com --type generic --format both
```

## API Details

The frontend uses GitHub's REST API:

```
POST https://api.github.com/repos/{owner}/{repo}/dispatches
Authorization: token ghp_xxxxx
Content-Type: application/json

{
  "event_type": "run-scraper",
  "client_payload": {
    "url": "https://example.com",
    "scraper_type": "generic",
    "output_format": "both",
    "custom_css": "{}"
  }
}
```

## License

MIT - Free forever.
