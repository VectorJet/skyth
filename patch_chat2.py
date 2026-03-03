import re

with open("platforms/web/src/lib/components/Chat.svelte", "r") as f:
    code = f.read()

code = code.replace("""          }
        }
        } else if (payload.type === 'reasoning-delta' && payload.text) {""", """          }
        } else if (payload.type === 'reasoning-delta' && payload.text) {""")

with open("platforms/web/src/lib/components/Chat.svelte", "w") as f:
    f.write(code)
