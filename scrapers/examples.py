import asyncio
import json
import sys
from datetime import datetime

sys.path.insert(0, "..")
from engine.scraper import scrape_page, save_csv, save_json


async def scrape_product(url: str, output_prefix: str = "product"):
    result = await scrape_page(url, "product")
    print(json.dumps(result["data"], indent=2, ensure_ascii=False))

    save_csv(result, f"{output_prefix}_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
    save_json(result, f"{output_prefix}_{datetime.now().strftime('%Y%m%d_%H%M%S')}")

    return result


async def scrape_news(url: str, output_prefix: str = "news"):
    result = await scrape_page(url, "news")
    print(json.dumps(result["data"], indent=2, ensure_ascii=False))

    save_csv(result, f"{output_prefix}_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
    save_json(result, f"{output_prefix}_{datetime.now().strftime('%Y%m%d_%H%M%S')}")

    return result


async def scrape_table(url: str, output_prefix: str = "table"):
    result = await scrape_page(url, "table")

    for key, table in result["data"].items():
        if isinstance(table, dict) and "rows" in table:
            print(f"\n{key}: {table['row_count']} rows")
            if table["headers"]:
                print(f"  Headers: {table['headers']}")
            for row in table["rows"][:5]:
                print(f"  Row: {row}")

    save_csv(result, f"{output_prefix}_{datetime.now().strftime('%Y%m%d_%H%M%S')}")
    save_json(result, f"{output_prefix}_{datetime.now().strftime('%Y%m%d_%H%M%S')}")

    return result


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python examples.py <type> <url>")
        print("Types: product, news, table")
        sys.exit(1)

    scrape_type = sys.argv[1]
    target_url = sys.argv[2]

    if scrape_type == "product":
        asyncio.run(scrape_product(target_url))
    elif scrape_type == "news":
        asyncio.run(scrape_news(target_url))
    elif scrape_type == "table":
        asyncio.run(scrape_table(target_url))
    else:
        print(f"Unknown type: {scrape_type}")
