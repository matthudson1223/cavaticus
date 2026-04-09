import { describe, it, expect } from 'vitest';
import { detectProviderFromModel, guessMimeType } from '../ws/handler.js';

describe('detectProviderFromModel', () => {
  it('detects claude models', () => {
    expect(detectProviderFromModel('claude-opus-4-6')).toBe('claude');
    expect(detectProviderFromModel('claude-haiku-4-5-20251001')).toBe('claude');
  });

  it('detects openai models', () => {
    expect(detectProviderFromModel('gpt-4o')).toBe('openai');
    expect(detectProviderFromModel('gpt-4o-mini')).toBe('openai');
    expect(detectProviderFromModel('o1')).toBe('openai');
    expect(detectProviderFromModel('o3-mini')).toBe('openai');
  });

  it('detects gemini models', () => {
    expect(detectProviderFromModel('gemini-2.0-flash')).toBe('gemini');
    expect(detectProviderFromModel('gemini-1.5-pro')).toBe('gemini');
  });

  it('detects deepseek models', () => {
    expect(detectProviderFromModel('deepseek-chat')).toBe('deepseek');
  });

  it('routes org/model strings to openrouter by default', () => {
    expect(detectProviderFromModel('google/gemini-3-flash-preview')).toBe('openrouter');
    expect(detectProviderFromModel('openai/gpt-4o')).toBe('openrouter');
  });

  it('detects local provider prefixes', () => {
    expect(detectProviderFromModel('ollama/llama3.3')).toBe('ollama');
    expect(detectProviderFromModel('lmstudio/my-model')).toBe('lmstudio');
    expect(detectProviderFromModel('custom/endpoint')).toBe('custom');
  });

  it('returns null for unknown models without a slash', () => {
    expect(detectProviderFromModel('unknown-model')).toBeNull();
  });
});

describe('guessMimeType', () => {
  it('returns correct types for known extensions', () => {
    expect(guessMimeType('index.html')).toBe('text/html');
    expect(guessMimeType('styles.css')).toBe('text/css');
    expect(guessMimeType('app.js')).toBe('application/javascript');
    expect(guessMimeType('app.mjs')).toBe('application/javascript');
    expect(guessMimeType('types.ts')).toBe('text/typescript');
    expect(guessMimeType('config.json')).toBe('application/json');
    expect(guessMimeType('README.md')).toBe('text/markdown');
    expect(guessMimeType('logo.svg')).toBe('image/svg+xml');
  });

  it('falls back to text/plain for unknown extensions', () => {
    expect(guessMimeType('file.txt')).toBe('text/plain');
    expect(guessMimeType('data.csv')).toBe('text/plain');
    expect(guessMimeType('noextension')).toBe('text/plain');
  });
});
