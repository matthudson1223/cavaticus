#!/usr/bin/env python3
"""List OpenRouter models that support tool calling."""

import os
import requests
import json

api_key = os.getenv('OPENROUTER_API_KEY')
if not api_key:
    print("Error: OPENROUTER_API_KEY environment variable not set")
    exit(1)

url = "https://openrouter.io/api/v1/models"
headers = {"Authorization": f"Bearer {api_key}"}

print("Fetching OpenRouter models...")
response = requests.get(url, headers=headers)

if response.status_code != 200:
    print(f"Error: {response.status_code}")
    print(response.text)
    exit(1)

models = response.json()['data']

# Filter for models that support tools
tool_models = [m for m in models if m.get('supported_parameters', {}).get('tools', False)]

print(f"\n=== OpenRouter Models with Tool Support ({len(tool_models)} total) ===\n")

for model in sorted(tool_models, key=lambda m: m['name']):
    model_id = model['id']
    name = model['name']
    pricing = model.get('pricing', {})
    input_price = pricing.get('input', 'unknown')
    output_price = pricing.get('output', 'unknown')
    print(f"{model_id:<50} {name:<40} Input: {input_price} Output: {output_price}")

print(f"\nTotal models with tool support: {len(tool_models)}")
