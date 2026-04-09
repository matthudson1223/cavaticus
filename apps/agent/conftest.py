"""Configure sys.path so tests can import the agent source and venv packages."""
import sys
import os

# Ensure the project root is on sys.path so `from src.xxx import ...` works
_ROOT = os.path.dirname(os.path.abspath(__file__))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

# Include venv site-packages for third-party dependencies
_VENV_SITE = os.path.join(_ROOT, "venv", "lib", "python3.12", "site-packages")
if os.path.isdir(_VENV_SITE) and _VENV_SITE not in sys.path:
    sys.path.append(_VENV_SITE)
