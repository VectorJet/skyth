import os
import glob
import re

tools = [
    "question", "bash", "edit", "glob", "grep", "batch", "read", "task",
    "webfetch", "write", "invalid", "skill", "websearch", "codesearch",
    "lsp", "apply_patch"
]

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    original = content
    for tool in tools:
        # replace import from "@/tools/xxx" with "@/tools/xxx_tool"
        content = re.sub(f'from "@/tools/{tool}"', f'from "@/tools/{tool}_tool"', content)
        content = re.sub(f'import\\("./{tool}"\\)', f'import("./{tool}_tool")', content)
        content = re.sub(f'import\\("@/tools/{tool}"\\)', f'import("@/tools/{tool}_tool")', content)
        
    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Fixed {filepath}")

for root, dirs, files in os.walk('skyth/'):
    for file in files:
        if file.endswith('.ts'):
            process_file(os.path.join(root, file))

