"""Providers catalogue endpoint — returns all supported models grouped by provider."""
from fastapi import APIRouter
from ..providers.clawspring_providers import PROVIDERS, list_ollama_models

router = APIRouter()


@router.get("/providers")
async def list_providers():
    """Return all supported providers and their model lists.

    For Ollama, also probes localhost:11434 for locally installed models.
    """
    result = []
    for name, cfg in PROVIDERS.items():
        models = list(cfg.get("models", []))

        # Augment Ollama with locally available models
        if name == "ollama":
            local = list_ollama_models(cfg.get("base_url", "http://localhost:11434"))
            # Merge: local models first, then defaults not already listed
            local_names = set(local)
            defaults_not_local = [m for m in models if m not in local_names]
            models = local + defaults_not_local

        result.append({
            "name": name,
            "type": cfg.get("type"),
            "requiresApiKey": cfg.get("api_key_env") is not None,
            "local": name in ("ollama", "lmstudio"),
            "models": models,
        })

    return result
