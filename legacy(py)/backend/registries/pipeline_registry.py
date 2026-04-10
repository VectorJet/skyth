import importlib
import inspect
import sys
from typing import Dict, Type, Any, Optional
from pathlib import Path

# Calculate Absolute Project Root
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(PROJECT_ROOT))

from backend.base_classes.basepipeline import BasePipeline

class PipelineRegistry:
    _pipelines: Dict[str, BasePipeline] = {}
    _pipeline_classes: Dict[str, Type[BasePipeline]] = {}

    @classmethod
    def register(cls, pipeline_class: Type[BasePipeline]):
        """Manually register a pipeline class."""
        pipeline_instance = pipeline_class() 
        cls._pipeline_classes[pipeline_instance.name] = pipeline_class
        cls._pipelines[pipeline_instance.name] = pipeline_instance
        print(f"[PipelineRegistry] Registered: {pipeline_instance.name}")

    @classmethod
    def discover(cls, root_dir: str = "backend"):
        """
        Recursively searches for files ending in '_pipeline.py'.
        """
        scan_path = (PROJECT_ROOT / root_dir).resolve()
        print(f"[PipelineRegistry] Scanning {scan_path} for pipelines...")
        
        if not scan_path.exists():
            return

        for file_path in scan_path.rglob("*_pipeline.py"):
            try:
                module_name = cls._get_module_name(file_path)
                module = importlib.import_module(module_name)
                for name, obj in inspect.getmembers(module):
                    if (inspect.isclass(obj) and 
                        issubclass(obj, BasePipeline) and 
                        obj is not BasePipeline):
                        cls.register(obj)
            except Exception as e:
                print(f"[PipelineRegistry] Error loading {file_path}: {e}")

    @classmethod
    def get_pipeline(cls, name: str, dependencies: Optional[Dict[str, Any]] = None) -> Optional[BasePipeline]:
        pipeline_class = cls._pipeline_classes.get(name)
        if pipeline_class:
            return pipeline_class(dependencies=dependencies)
        return None

    @classmethod
    def list_pipelines(cls) -> Dict[str, str]:
        return {name: p.description for name, p in cls._pipelines.items()}

    @staticmethod
    def _get_module_name(file_path: Path) -> str:
        """Converts absolute file path to dotted module path."""
        abs_path = file_path.resolve()
        relative_path = abs_path.relative_to(PROJECT_ROOT)
        return ".".join(relative_path.with_suffix("").parts)