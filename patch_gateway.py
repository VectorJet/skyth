with open("skyth/cli/runtime/commands/gateway.ts", "r") as f:
    code = f.read()

replacement = """              streamCb = (evt) => {
                if (evt.type === "text-delta" || evt.type === "reasoning-delta") {
                  webCh.streamDelta(normalizedMsg.chatId, { type: evt.type, text: evt.text });
                } else if (evt.type === "tool-call") {
                  webCh.streamDelta(normalizedMsg.chatId, {
                    type: evt.type,
                    toolCallId: evt.toolCallId,
                    toolName: evt.toolName,
                    args: evt.args,
                  });
                } else if (evt.type === "tool-result") {
                  webCh.streamDelta(normalizedMsg.chatId, {
                    type: evt.type,
                    toolCallId: evt.toolCallId,
                    result: evt.result,
                  });
                }
              };"""

code = code.replace("""              streamCb = (evt) => {
                if (evt.type === "text-delta" || evt.type === "reasoning-delta") {
                  webCh.streamDelta(normalizedMsg.chatId, { type: evt.type, text: evt.text });
                }
              };""", replacement)

with open("skyth/cli/runtime/commands/gateway.ts", "w") as f:
    f.write(code)
