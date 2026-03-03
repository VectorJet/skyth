import os
import glob
import re

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    original = content
    content = re.sub(r'from "@/base/base_agent/tools/base"', 'from "@/base/tool"', content)
    content = re.sub(r'\bTool\b', 'BaseTool', content)
    
    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Fixed {filepath}")

for root, dirs, files in os.walk('skyth/'):
    for file in files:
        if file.endswith('.ts') and not file.endswith('base.ts'):
            # Only fix imports in files that were relying on it
            if 'from "@/base/base_agent/tools/base"' in open(os.path.join(root, file)).read():
                process_file(os.path.join(root, file))

