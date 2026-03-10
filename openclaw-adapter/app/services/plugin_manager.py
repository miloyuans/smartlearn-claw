from __future__ import annotations

import importlib.util
import inspect
import sys
from pathlib import Path
from typing import Any, Callable, Dict


SkillCallable = Callable[[Dict[str, Any]], Dict[str, Any]]


class PluginManager:
    def __init__(self, plugin_dir: str, mongo_db: Any) -> None:
        self.plugin_dir = Path(plugin_dir)
        self.mongo_db = mongo_db
        self.skills: Dict[str, SkillCallable] = {}

    def load(self) -> Dict[str, SkillCallable]:
        if not self.plugin_dir.exists():
            raise FileNotFoundError(f"Plugin directory not found: {self.plugin_dir}")

        plugin_path = str(self.plugin_dir.resolve())
        if plugin_path not in sys.path:
            sys.path.insert(0, plugin_path)

        self._inject_db()

        for file_path in sorted(self.plugin_dir.glob("*.py")):
            if file_path.name in {"common.py", "register_plugins.py", "__init__.py"}:
                continue
            self._load_file_module(file_path)

        return self.skills

    def _inject_db(self) -> None:
        common_module_path = self.plugin_dir / "common.py"
        if not common_module_path.exists():
            return

        spec = importlib.util.spec_from_file_location("common", common_module_path)
        if spec is None or spec.loader is None:
            return

        module = importlib.util.module_from_spec(spec)
        sys.modules["common"] = module
        spec.loader.exec_module(module)

        if hasattr(module, "openclaw"):
            module.openclaw.db = self.mongo_db

    def _load_file_module(self, file_path: Path) -> None:
        module_name = file_path.stem
        spec = importlib.util.spec_from_file_location(module_name, file_path)
        if spec is None or spec.loader is None:
            return

        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)

        for _, candidate in inspect.getmembers(module, inspect.isfunction):
            skill_name = getattr(candidate, "__skill_name__", None)
            if not skill_name:
                continue
            self.skills[skill_name] = candidate

    def execute(self, skill_name: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        skill = self.skills.get(skill_name)
        if skill is None:
            raise KeyError(f"Skill not found: {skill_name}")

        result = skill(payload)
        if isinstance(result, dict):
            return result
        return {"result": result}

    def list_skills(self) -> list[str]:
        return sorted(self.skills.keys())
