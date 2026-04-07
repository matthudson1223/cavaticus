"""Web fetching tool for agent."""

from __future__ import annotations

import logging
import httpx

from .context import ToolContext
from .registry import ToolDef, ToolParam, registry

logger = logging.getLogger(__name__)


async def fetch_url(url: str, max_bytes: int = 50000) -> str:
    """Fetch content from a URL.

    Args:
        url: The URL to fetch
        max_bytes: Maximum bytes to return (default 50KB)

    Returns:
        The page content (text or HTML), truncated if necessary
    """
    try:
        logger.debug(f"fetch_url: Requesting {url}", {"url": url})
        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; CavatiAgent/1.0; +https://cavaticus.app)",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        }
        async with httpx.AsyncClient(timeout=10, headers=headers) as client:
            response = await client.get(url, follow_redirects=True)
            response.raise_for_status()

            content = response.text
            if len(content) > max_bytes:
                content = content[:max_bytes] + f"\n\n[Truncated - {len(response.text) - max_bytes} more bytes]"

            logger.debug(f"fetch_url: Success {response.status_code} - {len(content)} bytes", {"status": response.status_code, "bytes": len(content)})
            return content
    except httpx.HTTPError as e:
        error_msg = f"HTTP {e.response.status_code if hasattr(e, 'response') else '?'}: {str(e)[:100]}"
        logger.debug(f"fetch_url: HTTP Error from {url}", {"error": error_msg, "url": url})
        logger.error(f"HTTP error fetching {url}: {e}")
        return f"Error: Failed to fetch {url}: {error_msg}"
    except Exception as e:
        logger.debug(f"fetch_url: Exception from {url}", {"error": str(e)[:100], "url": url})
        logger.error(f"Error fetching {url}: {e}")
        return f"Error: {str(e)}"


async def handle_fetch_url(ctx: ToolContext, url: str) -> str:
    return await fetch_url(url)


registry.register(ToolDef(
    name="fetch_url",
    description="Fetch content from a URL. Use this to get information from the web.",
    params=[
        ToolParam(
            name="url",
            type="string",
            description="The URL to fetch (must start with http:// or https://)",
        )
    ],
    handler=handle_fetch_url,
))
