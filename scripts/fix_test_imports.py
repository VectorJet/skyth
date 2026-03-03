import os
import glob
import re

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    original = content
    content = re.sub(r"from ['\"](\.\./)+skyth/base/base_agent/tools/base['\"]", 'from "@/base/tool"', content)
    content = re.sub(r'from "@/base/base_agent/tools/base"', 'from "@/base/tool"', content)
    content = re.sub(r'\bTool\b', 'BaseTool', content)
    
    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Fixed {filepath}")

for root, dirs, files in os.walk('tests/'):
    for file in files:
        if file.endswith('.ts'):
            process_file(os.path.join(root, file))

