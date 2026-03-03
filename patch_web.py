with open("skyth/channels/web.ts", "r") as f:
    code = f.read()

replacement = """  streamDelta(chatId: string, event: { type: string; text?: string; toolCallId?: string; toolName?: string; args?: string; result?: any }): void {
    if (this.broadcastFn) {
      this.broadcastFn("chat.stream", {
        channel: this.name,
        chatId,"""

code = code.replace("""  streamDelta(chatId: string, event: { type: string; text?: string }): void {
    if (this.broadcastFn) {
      this.broadcastFn("chat.stream", {
        channel: this.name,
        chatId,""", replacement)

with open("skyth/channels/web.ts", "w") as f:
    f.write(code)
