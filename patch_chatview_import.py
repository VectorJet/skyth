import re

with open("platforms/web/src/lib/components/ChatView.svelte", "r") as f:
    code = f.read()

code = code.replace("""  import { Tool, ToolHeader, ToolInput, ToolOutput, ToolContent } from "$lib/components/tool";""", """  import { Tool, ToolHeader, ToolInput, ToolOutput, ToolContent } from "$lib/components/ai-elements/tool";""")

with open("platforms/web/src/lib/components/ChatView.svelte", "w") as f:
    f.write(code)
