"""Tests for provider detection and model routing."""
import pytest
from src.providers.clawspring_providers import detect_provider, bare_model


class TestDetectProvider:
    def test_anthropic_models(self):
        assert detect_provider("claude-opus-4-6") == "anthropic"
        assert detect_provider("claude-sonnet-4-6") == "anthropic"
        assert detect_provider("claude-haiku-4-5-20251001") == "anthropic"

    def test_openai_models(self):
        assert detect_provider("gpt-4o") == "openai"
        assert detect_provider("gpt-4o-mini") == "openai"
        assert detect_provider("o1") == "openai"
        assert detect_provider("o3-mini") == "openai"

    def test_gemini_models(self):
        assert detect_provider("gemini-2.0-flash") == "gemini"
        assert detect_provider("gemini-1.5-pro") == "gemini"
        assert detect_provider("gemini-2.5-pro-preview-03-25") == "gemini"

    def test_deepseek_models(self):
        assert detect_provider("deepseek-chat") == "deepseek"
        assert detect_provider("deepseek-reasoner") == "deepseek"

    def test_qwen_models(self):
        assert detect_provider("qwen-max") == "qwen"
        assert detect_provider("qwq-32b") == "qwen"

    def test_zhipu_models(self):
        assert detect_provider("glm-4-plus") == "zhipu"

    def test_kimi_models(self):
        assert detect_provider("moonshot-v1-8k") == "kimi"
        assert detect_provider("kimi-latest") == "kimi"

    def test_explicit_provider_prefix(self):
        """org/model format returns the org as provider name."""
        assert detect_provider("ollama/llama3.3") == "ollama"
        assert detect_provider("google/gemini-3-flash-preview") == "google"
        assert detect_provider("openai/gpt-4o") == "openai"

    def test_unknown_model_falls_back_to_openai(self):
        assert detect_provider("unknown-model-xyz") == "openai"


class TestBareModel:
    def test_strips_provider_prefix(self):
        assert bare_model("ollama/llama3.3") == "llama3.3"
        assert bare_model("google/gemini-flash") == "gemini-flash"
        assert bare_model("openai/gpt-4o") == "gpt-4o"

    def test_passes_through_plain_model_names(self):
        assert bare_model("claude-opus-4-6") == "claude-opus-4-6"
        assert bare_model("gpt-4o") == "gpt-4o"
        assert bare_model("gemini-2.0-flash") == "gemini-2.0-flash"
