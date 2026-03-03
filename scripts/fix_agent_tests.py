import re

with open('tests/agent_migration.test.ts', 'r') as f:
    content = f.read()

# Find all new AgentLoop(...) and add await loop.toolsReady;
# It's multi-line, so we can replace "    });\n\n" after AgentLoop init
content = re.sub(
    r'(const loop = new AgentLoop\(\{[\s\S]*?\}\);)',
    r'\1\n    await loop.toolsReady;',
    content
)

# Since some already have it from my previous replace, let's deduplicate
content = re.sub(r'await loop\.toolsReady;\n\s*await loop\.toolsReady;', 'await loop.toolsReady;', content)

with open('tests/agent_migration.test.ts', 'w') as f:
    f.write(content)
