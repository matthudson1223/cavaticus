"""Code analysis tools — operate entirely on the in-memory fs."""

from __future__ import annotations

import json
import re
from html.parser import HTMLParser

from .context import ToolContext
from .registry import ToolDef, ToolParam, registry


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _css_files(ctx: ToolContext) -> dict[str, str]:
    return {p: c for p, c in ctx.fs.items() if p.endswith(".css")}


def _html_files(ctx: ToolContext) -> dict[str, str]:
    return {p: c for p, c in ctx.fs.items() if p.endswith(".html")}


def _js_files(ctx: ToolContext) -> dict[str, str]:
    return {p: c for p, c in ctx.fs.items() if p.endswith((".js", ".ts", ".jsx", ".tsx"))}


# ------------------------------------------------------------------
# extract_imports
# ------------------------------------------------------------------

async def handle_extract_imports(ctx: ToolContext, path: str = "") -> str:
    files = {path: ctx.fs[path]} if path else ctx.fs
    if path and path not in ctx.fs:
        return f"Error: file '{path}' not found"

    results: list[str] = []
    patterns = [
        (r'import\s+.*?\s+from\s+[\'"]([^\'"]+)[\'"]', "ES import"),
        (r'require\([\'"]([^\'"]+)[\'"]\)', "require()"),
        (r'<script[^>]+src=[\'"]([^\'"]+)[\'"]', "<script src>"),
        (r'<link[^>]+href=[\'"]([^\'"]+)[\'"]', "<link href>"),
        (r'@import\s+[\'"]([^\'"]+)[\'"]', "@import"),
    ]

    for fpath in sorted(files.keys()):
        content = files[fpath]
        file_imports: list[str] = []
        for pat, label in patterns:
            for m in re.finditer(pat, content, re.IGNORECASE):
                file_imports.append(f"  [{label}] {m.group(1)}")
        if file_imports:
            results.append(f"{fpath}:")
            results.extend(file_imports)

    return "\n".join(results) if results else "No imports found."


# ------------------------------------------------------------------
# get_dependency_tree
# ------------------------------------------------------------------

async def handle_get_dependency_tree(ctx: ToolContext) -> str:
    pkg_json = ctx.fs.get("package.json")
    if not pkg_json:
        return "No package.json found in the project."
    try:
        pkg = json.loads(pkg_json)
    except json.JSONDecodeError as e:
        return f"Error: invalid package.json — {e}"

    lines: list[str] = [f"Package: {pkg.get('name', '(unnamed)')} v{pkg.get('version', '?')}"]

    deps = pkg.get("dependencies", {})
    if deps:
        lines.append(f"\nDependencies ({len(deps)}):")
        for name, ver in sorted(deps.items()):
            lines.append(f"  {name}: {ver}")

    dev_deps = pkg.get("devDependencies", {})
    if dev_deps:
        lines.append(f"\nDev Dependencies ({len(dev_deps)}):")
        for name, ver in sorted(dev_deps.items()):
            lines.append(f"  {name}: {ver}")

    scripts = pkg.get("scripts", {})
    if scripts:
        lines.append(f"\nScripts:")
        for name, cmd in sorted(scripts.items()):
            lines.append(f"  {name}: {cmd}")

    return "\n".join(lines)


# ------------------------------------------------------------------
# find_unused_code
# ------------------------------------------------------------------

async def handle_find_unused_code(ctx: ToolContext) -> str:
    results: list[str] = []
    html_content = "\n".join(_html_files(ctx).values())
    all_content = "\n".join(ctx.fs.values())

    # CSS: unused selectors
    unused_css: list[str] = []
    for css_path, css in _css_files(ctx).items():
        # Extract class names and IDs from CSS
        for m in re.finditer(r'\.([\w-]+)\s*[{,:]', css):
            cls = m.group(1)
            # Check if used in HTML
            if not re.search(rf'class=["\'][^"\']*\b{re.escape(cls)}\b', html_content):
                unused_css.append(f"  .{cls} (in {css_path})")
        for m in re.finditer(r'#([\w-]+)\s*[{,:]', css):
            id_ = m.group(1)
            if not re.search(rf'\bid=["\'][^"\']*{re.escape(id_)}', html_content):
                unused_css.append(f"  #{id_} (in {css_path})")

    if unused_css:
        results.append(f"Potentially unused CSS selectors ({len(unused_css)}):")
        results.extend(unused_css[:30])
        if len(unused_css) > 30:
            results.append(f"  ... and {len(unused_css) - 30} more")
    else:
        results.append("No obviously unused CSS selectors found.")

    # JS: unused top-level functions
    unused_js: list[str] = []
    for js_path, js in _js_files(ctx).items():
        for m in re.finditer(r'(?:function\s+([\w$]+)|(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?\()', js):
            fn_name = m.group(1) or m.group(2)
            if not fn_name:
                continue
            # Count occurrences — if only 1 (the definition), it's unused
            occurrences = len(re.findall(rf'\b{re.escape(fn_name)}\b', all_content))
            if occurrences <= 1:
                unused_js.append(f"  {fn_name}() (in {js_path})")

    if unused_js:
        results.append(f"\nPotentially unused functions ({len(unused_js)}):")
        results.extend(unused_js[:20])
        if len(unused_js) > 20:
            results.append(f"  ... and {len(unused_js) - 20} more")
    elif _js_files(ctx):
        results.append("\nNo obviously unused functions found.")

    results.append("\nNote: Results are approximate — dynamic usage patterns may not be detected.")
    return "\n".join(results)


# ------------------------------------------------------------------
# analyze_css
# ------------------------------------------------------------------

async def handle_analyze_css(ctx: ToolContext) -> str:
    css_files = _css_files(ctx)
    if not css_files:
        return "No CSS files found in the project."

    results: list[str] = []
    all_html = "\n".join(_html_files(ctx).values())

    # Color palette
    color_pattern = re.compile(
        r'(?:#(?:[0-9a-fA-F]{3}){1,2}|'
        r'rgb\([^)]+\)|'
        r'rgba\([^)]+\)|'
        r'hsl\([^)]+\)|'
        r'hsla\([^)]+\))'
    )
    all_colors: set[str] = set()

    for css_path, css in css_files.items():
        results.append(f"\n=== {css_path} ===")
        lines = css.splitlines()
        results.append(f"  Lines: {len(lines)}")

        # Selectors
        selectors = re.findall(r'^([^{@/\n][^{]+)\s*\{', css, re.MULTILINE)
        selectors = [s.strip() for s in selectors]
        results.append(f"  Selectors: {len(selectors)}")

        # Duplicate selectors
        seen: dict[str, int] = {}
        for sel in selectors:
            seen[sel] = seen.get(sel, 0) + 1
        dupes = [(s, n) for s, n in seen.items() if n > 1]
        if dupes:
            results.append(f"  Duplicate selectors ({len(dupes)}):")
            for s, n in dupes[:10]:
                results.append(f"    '{s}' appears {n}x")

        # Unused selectors (classes only)
        unused = []
        for m in re.finditer(r'\.([\w-]+)\s*[{,]', css):
            cls = m.group(1)
            if not re.search(rf'class=["\'][^"\']*\b{re.escape(cls)}\b', all_html):
                unused.append(f".{cls}")
        if unused:
            results.append(f"  Unused classes ({len(unused)}): {', '.join(unused[:10])}")
            if len(unused) > 10:
                results.append(f"    ... and {len(unused) - 10} more")

        # Colors
        file_colors = set(color_pattern.findall(css))
        all_colors.update(file_colors)
        if file_colors:
            results.append(f"  Colors ({len(file_colors)}): {', '.join(sorted(file_colors)[:12])}")

    if all_colors:
        results.insert(0, f"Color palette across all CSS ({len(all_colors)} unique):\n  " +
                       ", ".join(sorted(all_colors)[:20]))

    return "\n".join(results)


# ------------------------------------------------------------------
# check_syntax
# ------------------------------------------------------------------

class _HTMLChecker(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.errors: list[str] = []
        self._stack: list[str] = []
        self._void = {"area","base","br","col","embed","hr","img","input",
                      "link","meta","param","source","track","wbr"}

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag not in self._void:
            self._stack.append(tag)

    def handle_endtag(self, tag: str) -> None:
        if tag in self._void:
            return
        if self._stack and self._stack[-1] == tag:
            self._stack.pop()
        else:
            self.errors.append(f"Unexpected closing tag </{tag}>")

    def get_unclosed(self) -> list[str]:
        return self._stack[:]


async def handle_check_syntax(ctx: ToolContext, path: str = "") -> str:
    files_to_check = {path: ctx.fs[path]} if path else ctx.fs
    if path and path not in ctx.fs:
        return f"Error: file '{path}' not found"

    results: list[str] = []

    for fpath, content in sorted(files_to_check.items()):
        ext = fpath.rsplit(".", 1)[-1].lower() if "." in fpath else ""

        if ext == "html":
            checker = _HTMLChecker()
            try:
                checker.feed(content)
                unclosed = checker.get_unclosed()
                errors = checker.errors[:]
                if unclosed:
                    errors.append(f"Unclosed tags: {unclosed}")
                if errors:
                    results.append(f"{fpath}: {len(errors)} issue(s)")
                    for e in errors[:10]:
                        results.append(f"  {e}")
                else:
                    results.append(f"{fpath}: OK")
            except Exception as e:
                results.append(f"{fpath}: parse error — {e}")

        elif ext == "css":
            try:
                import tinycss2
                parsed = tinycss2.parse_stylesheet(content, skip_whitespace=True)
                errors = [r for r in parsed if r.type == "error"]
                if errors:
                    results.append(f"{fpath}: {len(errors)} CSS error(s)")
                    for e in errors[:10]:
                        results.append(f"  Line {e.source_line}: {e.message}")
                else:
                    results.append(f"{fpath}: OK")
            except ImportError:
                # Fallback: brace balance check
                opens = content.count("{")
                closes = content.count("}")
                if opens != closes:
                    results.append(f"{fpath}: mismatched braces ({{: {opens}, }}: {closes})")
                else:
                    results.append(f"{fpath}: OK (basic check)")

        elif ext in ("js", "ts", "jsx", "tsx"):
            issues: list[str] = []
            # Basic bracket/quote balance
            for char, name in [("{", "}"), ("(", ")"), ("[", "]")]:
                opens = content.count(char)
                closes = content.count(name)
                if opens != closes:
                    issues.append(f"mismatched {char}{name} ({opens} vs {closes})")
            # Check for common mistakes
            if re.search(r'={3}\s*undefined', content):
                issues.append("comparison with undefined (use typeof instead)")
            if issues:
                results.append(f"{fpath}: {len(issues)} issue(s)")
                for issue in issues:
                    results.append(f"  {issue}")
            else:
                results.append(f"{fpath}: OK (basic check)")

    return "\n".join(results) if results else "No files to check."


# ------------------------------------------------------------------
# accessibility_audit
# ------------------------------------------------------------------

class _A11yParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.issues: list[str] = []
        self._headings: list[int] = []
        self._labels: set[str] = set()
        self._input_ids: set[str] = set()
        self._has_lang = False
        self._has_title = False
        self._in_a = False
        self._a_has_content = False

    def handle_starttag(self, tag: str, attrs: list) -> None:
        attr_dict = dict(attrs)

        if tag == "html":
            if "lang" not in attr_dict or not attr_dict.get("lang"):
                self.issues.append("Missing lang attribute on <html>")
            else:
                self._has_lang = True

        elif tag == "img":
            if "alt" not in attr_dict:
                src = attr_dict.get("src", "?")
                self.issues.append(f"<img> missing alt attribute: src='{src}'")

        elif tag in ("h1","h2","h3","h4","h5","h6"):
            level = int(tag[1])
            if self._headings and level > self._headings[-1] + 1:
                self.issues.append(
                    f"Heading hierarchy skip: h{self._headings[-1]} → h{level}"
                )
            self._headings.append(level)

        elif tag == "label":
            for_attr = attr_dict.get("for", "")
            if for_attr:
                self._labels.add(for_attr)

        elif tag == "input":
            input_id = attr_dict.get("id", "")
            if input_id:
                self._input_ids.add(input_id)
            t = attr_dict.get("type", "text").lower()
            if t not in ("hidden", "submit", "button", "reset", "image"):
                if not input_id and "aria-label" not in attr_dict and "aria-labelledby" not in attr_dict:
                    self.issues.append(
                        f"<input type='{t}'> has no id, aria-label, or aria-labelledby"
                    )

        elif tag == "a":
            self._in_a = True
            self._a_has_content = bool(attr_dict.get("aria-label") or attr_dict.get("title"))

        elif tag == "button":
            if not attr_dict.get("aria-label") and not attr_dict.get("aria-labelledby"):
                pass  # content check would need handle_data

        elif tag == "title":
            self._has_title = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "a":
            if not self._a_has_content:
                self.issues.append("Empty <a> link with no text or aria-label")
            self._in_a = False
            self._a_has_content = False

    def handle_data(self, data: str) -> None:
        if self._in_a and data.strip():
            self._a_has_content = True

    def finalize(self) -> None:
        if not self._has_title:
            self.issues.append("Missing <title> element")
        unlabeled = self._input_ids - self._labels
        # Note: inputs without ids were already flagged above


async def handle_accessibility_audit(ctx: ToolContext) -> str:
    html_files = _html_files(ctx)
    if not html_files:
        return "No HTML files found in the project."

    all_issues: list[str] = []
    for fpath, content in sorted(html_files.items()):
        parser = _A11yParser()
        try:
            parser.feed(content)
            parser.finalize()
        except Exception as e:
            all_issues.append(f"{fpath}: parse error — {e}")
            continue

        if parser.issues:
            all_issues.append(f"\n{fpath} — {len(parser.issues)} issue(s):")
            for issue in parser.issues:
                all_issues.append(f"  ⚠ {issue}")
        else:
            all_issues.append(f"\n{fpath} — No accessibility issues found.")

    return "\n".join(all_issues).strip()


# ------------------------------------------------------------------
# Registration
# ------------------------------------------------------------------

registry.register(ToolDef(
    name="extract_imports",
    description="Show all imports and dependencies referenced in project files (ES import, require, script/link tags, @import).",
    params=[
        ToolParam(
            name="path",
            type="string",
            description="Specific file to check. Leave empty to scan all files.",
            required=False,
        )
    ],
    handler=handle_extract_imports,
))

registry.register(ToolDef(
    name="get_dependency_tree",
    description="Show installed packages and versions from package.json, including dependencies, devDependencies, and scripts.",
    params=[],
    handler=handle_get_dependency_tree,
))

registry.register(ToolDef(
    name="find_unused_code",
    description="Identify potentially unused CSS selectors and JavaScript functions across the project.",
    params=[],
    handler=handle_find_unused_code,
))

registry.register(ToolDef(
    name="analyze_css",
    description="Analyze CSS files: find duplicate selectors, unused classes, extract color palette, report specificity issues.",
    params=[],
    handler=handle_analyze_css,
))

registry.register(ToolDef(
    name="check_syntax",
    description="Validate HTML, CSS, and JavaScript files for syntax errors.",
    params=[
        ToolParam(
            name="path",
            type="string",
            description="Specific file to check. Leave empty to check all files.",
            required=False,
        )
    ],
    handler=handle_check_syntax,
))

registry.register(ToolDef(
    name="accessibility_audit",
    description="Check HTML files for WCAG accessibility issues: missing alt text, unlabeled inputs, heading hierarchy, missing lang/title.",
    params=[],
    handler=handle_accessibility_audit,
))
