import re

with open('tests/agent_migration.test.ts', 'r') as f:
    content = f.read()

content = content.replace('const names = loop.tools.toolNames;', 'const names = loop.tools.toolNames; console.log("TOOLS REGISTERED: ", names);')

with open('tests/agent_migration.test.ts', 'w') as f:
    f.write(content)
