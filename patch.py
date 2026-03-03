with open("skyth/providers/ai_sdk_provider.ts", "r") as f:
    code = f.read()

import re

# Remove the fallback
code = re.sub(
    r'// Provider/tool-calling reliability: route tool-enabled turns through\s+// generateText path \(same as non-stream runtime\) and emit a done event\.\s+if \(params\.tools\?\.length\) \{.*?\s+return response;\s+\}',
    '',
    code,
    flags=re.DOTALL
)

# Add stream handling
replacement = """      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          params.onStream({ type: "text-delta", text: part.text });
        } else if (part.type === "reasoning-delta") {
          params.onStream({ type: "reasoning-delta", text: part.text });
        } else if (part.type === "tool-call-streaming-start") {
          params.onStream({ type: "tool-call", toolCallId: part.toolCallId, toolName: part.toolName, args: "" });
        } else if (part.type === "tool-call-delta") {
          params.onStream({ type: "tool-call", toolCallId: part.toolCallId, toolName: part.toolName, args: part.argsTextDelta });
        } else if (part.type === "tool-call") {
          // Send full stringified args for completeness
          params.onStream({ type: "tool-call", toolCallId: part.toolCallId, toolName: part.toolName, args: JSON.stringify(part.args) });
        } else if (part.type === "tool-result") {
          params.onStream({ type: "tool-result", toolCallId: part.toolCallId, result: part.result });
        }
      }"""

code = code.replace("""      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          params.onStream({ type: "text-delta", text: part.text });
        } else if (part.type === "reasoning-delta") {
          params.onStream({ type: "reasoning-delta", text: part.text });
        }
      }""", replacement)

with open("skyth/providers/ai_sdk_provider.ts", "w") as f:
    f.write(code)
