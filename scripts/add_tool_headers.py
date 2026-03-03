import os
import glob
import re

tools_dir = 'skyth/tools'
for filepath in glob.glob(f'{tools_dir}/*_tool.ts'):
    filename = os.path.basename(filepath)
    tool_name = filename.replace('_tool.ts', '')
    
    with open(filepath, 'r') as f:
        content = f.read()
        
    if '/**\n * @tool' in content:
        continue
        
    header = f"""/**
 * @tool {tool_name}
 * @author skyth-team
 * @version 1.0.0
 * @description {tool_name} tool
 */
"""
    with open(filepath, 'w') as f:
        f.write(header + content)
        print(f"Added header to {filename}")
