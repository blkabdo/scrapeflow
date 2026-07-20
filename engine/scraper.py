import argparse
import asyncio
import json
import csv
import os
import sys
from datetime import datetime
from urllib.parse import urlparse

from playwright.async_api import async_playwright
from bs4 import BeautifulSoup


SCRAPER_STRATEGIES = {
    "generic": {
        "name": "Generic Page Scraper",
        "selectors": {
            "title": "title, h1",
            "description": "meta[name=description], .description, p",
            "links": "a[href]",
            "images": "img[src]",
        },
    },
    "product": {
        "name": "Product Page Scraper",
        "selectors": {
            "title": "h1, .product-title, .product-name, [data-testid='product-title']",
            "price": ".price, .product-price, [data-testid='price'], span[class*='price']",
            "description": ".product-description, .description, [data-testid='description']",
            "image": ".product-image img, .gallery img, [data-testid='product-image'] img",
            "rating": ".rating, .stars, [data-testid='rating']",
            "availability": ".availability, .stock, [data-testid='availability']",
        },
    },
    "news": {
        "name": "News Article Scraper",
        "selectors": {
            "headline": "h1, .headline, .article-title, article h1",
            "body": "article p, .article-body p, .content p, .story-body p",
            "author": ".author, .byline, [rel='author'], .writer",
            "date": "time, .date, .publish-date, [datetime]",
            "image": "article img, .article-image img, figure img",
            "source": ".source, .publisher, .outlet",
        },
    },
    "table": {
        "name": "Table Data Scraper",
        "selectors": {
            "tables": "table",
        },
    },
    "custom": {
        "name": "Custom CSS Scraper",
        "selectors": {},
    },
}


async def scrape_page(url: str, scraper_type: str, custom_css: dict = None) -> dict:
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
            ],
        )
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1920, "height": 1080},
        )
        page = await context.new_page()

        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(2000)

            html = await page.content()
            soup = BeautifulSoup(html, "lxml")

            result = {
                "url": url,
                "scraped_at": datetime.utcnow().isoformat(),
                "scraper_type": scraper_type,
                "status": "success",
                "data": {},
            }

            strategy = SCRAPER_STRATEGIES.get(scraper_type, SCRAPER_STRATEGIES["generic"])

            if scraper_type == "custom" and custom_css:
                selectors = custom_css
            else:
                selectors = strategy.get("selectors", {})

            if scraper_type == "table":
                result["data"] = extract_tables(soup)
            else:
                for field, selector in selectors.items():
                    elements = soup.select(selector)
                    if elements:
                        if len(elements) == 1:
                            result["data"][field] = clean_text(elements[0].get_text())
                        else:
                            result["data"][field] = [
                                clean_text(el.get_text()) for el in elements
                            ]
                    else:
                        result["data"][field] = None

            result["data"]["all_links"] = list(
                set(
                    a.get("href", "")
                    for a in soup.find_all("a", href=True)
                    if a.get("href", "").startswith(("http", "/"))
                )
            )[:100]

            result["data"]["all_images"] = list(
                set(img.get("src", "") for img in soup.find_all("img", src=True))
            )[:50]

            result["data"]["meta"] = {}
            for meta in soup.find_all("meta"):
                name = meta.get("name") or meta.get("property", "")
                content = meta.get("content", "")
                if name and content:
                    result["data"]["meta"][name] = content

        except Exception as e:
            result = {
                "url": url,
                "scraped_at": datetime.utcnow().isoformat(),
                "scraper_type": scraper_type,
                "status": "error",
                "error": str(e),
                "data": {},
            }

        finally:
            await browser.close()

    return result


def extract_tables(soup: BeautifulSoup) -> dict:
    tables_data = {}
    tables = soup.find_all("table")

    for idx, table in enumerate(tables):
        headers = []
        header_row = table.find("thead")
        if header_row:
            headers = [
                clean_text(th.get_text()) for th in header_row.find_all(["th", "td"])
            ]

        if not headers:
            first_row = table.find("tr")
            if first_row:
                headers = [
                    clean_text(th.get_text()) for th in first_row.find_all(["th", "td"])
                ]

        rows = []
        body = table.find("tbody") or table
        for tr in body.find_all("tr"):
            cells = [clean_text(td.get_text()) for td in tr.find_all(["td", "th"])]
            if cells:
                if headers and len(cells) == len(headers):
                    rows.append(dict(zip(headers, cells)))
                else:
                    rows.append(cells)

        tables_data[f"table_{idx + 1}"] = {
            "headers": headers,
            "rows": rows,
            "row_count": len(rows),
        }

    return tables_data


def clean_text(text: str) -> str:
    if not text:
        return ""
    lines = (line.strip() for line in text.splitlines())
    chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
    return " ".join(chunk for chunk in chunks if chunk)


def save_csv(data: dict, filename: str):
    flat_data = flatten_for_csv(data)

    if not flat_data:
        print("No data to save as CSV")
        return

    filepath = f"{filename}.csv"
    with open(filepath, "w", newline="", encoding="utf-8") as f:
        if isinstance(flat_data[0], dict):
            writer = csv.DictWriter(f, fieldnames=flat_data[0].keys())
            writer.writeheader()
            writer.writerows(flat_data)
        else:
            writer = csv.writer(f)
            writer.writerows(flat_data)

    print(f"Saved CSV: {filepath}")


def save_json(data: dict, filename: str):
    filepath = f"{filename}.json"
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"Saved JSON: {filepath}")


def flatten_for_csv(data: dict) -> list:
    scrape_data = data.get("data", {})
    rows = []

    simple_fields = {k: v for k, v in scrape_data.items() if not isinstance(v, (list, dict))}
    simple_fields["url"] = data.get("url", "")
    simple_fields["scraped_at"] = data.get("scraped_at", "")
    simple_fields["status"] = data.get("status", "")

    if "all_links" in scrape_data:
        simple_fields["links_count"] = len(scrape_data["all_links"])
    if "all_images" in scrape_data:
        simple_fields["images_count"] = len(scrape_data["all_images"])

    for key in ["all_links", "all_images", "meta"]:
        simple_fields.pop(key, None)

    tables = {k: v for k, v in scrape_data.items() if isinstance(v, dict) and "rows" in v}
    if tables:
        for table_name, table_data in tables.items():
            for row in table_data.get("rows", []):
                merged = {**simple_fields, "table_name": table_name}
                if isinstance(row, dict):
                    merged.update(row)
                else:
                    merged["row_data"] = str(row)
                rows.append(merged)
    else:
        rows.append(simple_fields)

    return rows


async def main():
    parser = argparse.ArgumentParser(description="Web Scraper Engine")
    parser.add_argument("--url", required=True, help="Target URL")
    parser.add_argument(
        "--type",
        default="generic",
        choices=["generic", "product", "news", "table", "custom"],
        help="Scraper type",
    )
    parser.add_argument(
        "--format", default="both", choices=["csv", "json", "both"], help="Output format"
    )
    parser.add_argument("--css", default="{}", help="Custom CSS selectors as JSON")
    parser.add_argument("--output", default="results", help="Output filename prefix")

    args = parser.parse_args()

    print(f"Starting scrape...")
    print(f"  URL: {args.url}")
    print(f"  Type: {args.type}")
    print(f"  Format: {args.format}")

    custom_css = {}
    if args.css and args.css != "{}":
        try:
            custom_css = json.loads(args.css)
        except json.JSONDecodeError:
            print(f"Warning: Invalid CSS JSON, using defaults")

    result = await scrape_page(args.url, args.type, custom_css)

    print(f"Scrape status: {result['status']}")
    if result["status"] == "error":
        print(f"Error: {result.get('error', 'Unknown error')}")
        sys.exit(1)

    data_count = len([v for v in result["data"].values() if v])
    print(f"Extracted {data_count} fields")

    if args.format in ("csv", "both"):
        save_csv(result, args.output)
    if args.format in ("json", "both"):
        save_json(result, args.output)

    print("Done!")


if __name__ == "__main__":
    asyncio.run(main())
