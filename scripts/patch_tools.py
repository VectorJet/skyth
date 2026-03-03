import glob
import re

files = glob.glob('skyth/tools/*_tool.ts')
for f in files:
    with open(f, 'r') as file:
        content = file.read()

    # Update signature if it just has params
    content = re.sub(r'async execute\(params: Record<string, any>\): Promise<string> \{', 
                     r'async execute(params: Record<string, any>, ctx?: any): Promise<string> {', 
                     content)

    # Replace process.cwd() with ctx?.workspace ?? process.cwd()
    content = re.sub(r'(const workspace = )process\.cwd\(\);', 
                     r'\1ctx?.workspace ?? process.cwd();', 
                     content)
    
    with open(f, 'w') as file:
        file.write(content)

