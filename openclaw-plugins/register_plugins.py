"""Explicit plugin imports for runtimes that require pre-registration."""

from importlib import import_module
from typing import List


PLUGIN_MODULES = [
    "analyze_material",
    "tutor_subject",
    "review_plan",
    "generate_exam",
    "award_points",
    "post_wish",
    "write_diary",
]


def register_all() -> List[str]:
    loaded = []
    for module in PLUGIN_MODULES:
        import_module(module)
        loaded.append(module)
    return loaded


if __name__ == "__main__":
    for name in register_all():
        print(f"loaded plugin: {name}")
