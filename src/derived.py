"""
Compute analyst ratio/growth metrics from the standardized raw facts.

Derived metrics are defined as formulas in config/field_dictionary.json, e.g.
    gross_margin       = gross_profit / revenue
    rd_intensity       = research_development_expense / revenue
    revenue_yoy_growth = (revenue - revenue_prior_year) / revenue_prior_year

Three things the formula language supports, matching how the dictionary is written:

  * RAW field keys            -> the value for this (company, fiscal_year, period)
  * <key>_prior_year          -> the same field one fiscal year earlier, SAME fiscal
                                 period (the correct YoY comparison for non-calendar
                                 fiscal years and for quarterly series alike)
  * other DERIVED metric keys -> resolved by repeated passes until the dependency
                                 graph settles (e.g. roic depends on effective_tax_rate
                                 and total_debt, which are themselves derived)

Documented fallback: Alphabet never tags GrossProfit, so when gross_profit is absent
we backfill it from revenue - cost_of_revenue (per the dictionary's note).

Formulas are evaluated with a SAFE ast walker — only names, numbers, + - * /,
parentheses and unary signs. Missing inputs or divide-by-zero yield None (recorded,
not crashed) so gaps stay explicit instead of corrupting the dataset.
"""
from __future__ import annotations

import ast
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data" / "standardized"
DICT_PATH = ROOT / "config" / "field_dictionary.json"

_ALLOWED = (ast.Expression, ast.BinOp, ast.UnaryOp, ast.Add, ast.Sub, ast.Mult,
            ast.Div, ast.USub, ast.UAdd, ast.Constant, ast.Name, ast.Load)


class _Missing(Exception):
    pass


def _ev(node, names):
    if isinstance(node, ast.Expression):
        return _ev(node.body, names)
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.Name):
        v = names.get(node.id)
        if v is None:
            raise _Missing(node.id)
        return v
    if isinstance(node, ast.BinOp):
        l, r = _ev(node.left, names), _ev(node.right, names)
        if isinstance(node.op, ast.Add): return l + r
        if isinstance(node.op, ast.Sub): return l - r
        if isinstance(node.op, ast.Mult): return l * r
        if isinstance(node.op, ast.Div):
            if r == 0:
                raise _Missing("div0")
            return l / r
    if isinstance(node, ast.UnaryOp):
        v = _ev(node.operand, names)
        return -v if isinstance(node.op, ast.USub) else v
    raise ValueError(f"Disallowed expression: {ast.dump(node)}")


def _compile(formula, key):
    tree = ast.parse(formula, mode="eval")
    for n in ast.walk(tree):
        if not isinstance(n, _ALLOWED):
            raise ValueError(f"Disallowed node {type(n).__name__} in metric '{key}'")
    return tree


def main():
    field_dict = json.loads(DICT_PATH.read_text(encoding="utf-8"))
    rows = json.loads((OUT_DIR / "facts_long.json").read_text(encoding="utf-8"))
    metrics = field_dict.get("derived_metrics", [])
    compiled = {m["key"]: _compile(m["formula"], m["key"]) for m in metrics}

    # cube: (ticker, fy, fp) -> {raw_field_key: value}
    cube = {}
    for r in rows:
        cube.setdefault((r["ticker"], r["fiscal_year"], r["fiscal_period"]), {})[r["field_key"]] = r["value"]

    out = []
    for (ticker, fy, fp), raw in cube.items():
        period_kind = "annual" if fp == "FY" else "quarterly"
        names = dict(raw)

        # documented gross_profit fallback (e.g. Alphabet)
        if names.get("gross_profit") is None and raw.get("revenue") is not None and raw.get("cost_of_revenue") is not None:
            names["gross_profit"] = raw["revenue"] - raw["cost_of_revenue"]

        # Additive balance-sheet components that are legitimately $0 when a company
        # doesn't report them (e.g. Meta has no short-term debt; NVIDIA had no goodwill
        # for years). Seed them to 0 so SUM aggregates (total_debt, net_debt,
        # tangible_book_value, deferred_revenue_total) don't collapse to null on one gap.
        # Raw rows stay None — only the derived layer coalesces.
        for z in ("short_term_debt", "commercial_paper", "short_term_investments",
                  "long_term_investments", "goodwill", "intangible_assets_net",
                  "deferred_revenue_current", "deferred_revenue_noncurrent"):
            names.setdefault(z, 0)

        # inject prior-year same-period raw values as <key>_prior_year
        prior = cube.get((ticker, fy - 1, fp), {})
        for k, v in prior.items():
            if v is not None:
                names[f"{k}_prior_year"] = v

        # resolve derived metrics via fixpoint passes (handles metric-on-metric deps)
        results = {}
        for _ in range(len(metrics) + 1):
            progressed = False
            for m in metrics:
                if m["key"] in results:
                    continue
                try:
                    val = _ev(compiled[m["key"]], names)
                except _Missing:
                    continue  # maybe a dependency fills in on a later pass
                except Exception:
                    val = None
                results[m["key"]] = val
                if val is not None:
                    names[m["key"]] = val  # feed back for dependents
                progressed = True
            if not progressed:
                break
        # any still-unresolved metric is genuinely missing
        for m in metrics:
            val = results.get(m["key"])
            out.append({
                "ticker": ticker, "fiscal_year": fy, "fiscal_period": fp,
                "period": period_kind, "field_key": m["key"], "label": m["label"],
                "statement": "derived", "value": val, "unit": m.get("unit", ""),
                "formula": m["formula"], "priority": m.get("priority", ""),
            })

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "metrics_long.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    _write_csv(out)
    non_null = sum(1 for r in out if r["value"] is not None)
    print(f"Computed {len(out)} derived metric cells ({non_null} non-null, "
          f"{len(out)-non_null} gaps) -> metrics_long.json / metrics_long.csv")


def _write_csv(rows):
    import csv
    if not rows:
        return
    with open(OUT_DIR / "metrics_long.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)


if __name__ == "__main__":
    main()
