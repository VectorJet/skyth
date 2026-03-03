import re

with open('tests/pending_merge_consumption.test.ts', 'r') as f:
    content = f.read()

content = re.sub(
    r'(const loop = new AgentLoop\(\{[\s\S]*?\}\);)',
    r'\1\n    await loop.toolsReady;',
    content
)

content = re.sub(r'await loop\.toolsReady;\n\s*await loop\.toolsReady;', 'await loop.toolsReady;', content)

with open('tests/pending_merge_consumption.test.ts', 'w') as f:
    f.write(content)
