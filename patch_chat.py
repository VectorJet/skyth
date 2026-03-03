import re

with open("platforms/web/src/lib/components/Chat.svelte", "r") as f:
    code = f.read()

# Add toolCalls to Message interface
code = code.replace("""  interface Message {
    id: string;
    sender: string;
    content: string;
    reasoning?: string;
    timestamp: string;
    isOwn: boolean;
  }""", """  interface ToolCall {
    id: string;
    name: string;
    args: string;
    result?: any;
    state: 'running' | 'completed' | 'error';
  }

  interface Message {
    id: string;
    sender: string;
    content: string;
    reasoning?: string;
    toolCalls?: ToolCall[];
    timestamp: string;
    isOwn: boolean;
  }""")

# Add streamingToolCalls state
code = code.replace("  let streamingReasoning = '';", "  let streamingReasoning = '';\n  let streamingToolCalls = $state<ToolCall[]>([]);")

# Initialize streamingMessage with toolCalls
code = code.replace("""            streamingMessage = {
              id: Math.random().toString(36).slice(2),
              sender: 'Skyth',
              content: streamingContent,
              timestamp: new Date().toLocaleTimeString(),
              isOwn: false
            };""", """            streamingMessage = {
              id: Math.random().toString(36).slice(2),
              sender: 'Skyth',
              content: streamingContent,
              toolCalls: streamingToolCalls,
              timestamp: new Date().toLocaleTimeString(),
              isOwn: false
            };""")

code = code.replace("""            streamingMessage = {
              id: Math.random().toString(36).slice(2),
              sender: 'Skyth',
              content: '',
              reasoning: streamingReasoning,
              timestamp: new Date().toLocaleTimeString(),
              isOwn: false
            };""", """            streamingMessage = {
              id: Math.random().toString(36).slice(2),
              sender: 'Skyth',
              content: '',
              reasoning: streamingReasoning,
              toolCalls: streamingToolCalls,
              timestamp: new Date().toLocaleTimeString(),
              isOwn: false
            };""")

# Add tool-call and tool-result handling
tool_handling = """        } else if (payload.type === 'tool-call') {
          const index = streamingToolCalls.findIndex(tc => tc.id === payload.toolCallId);
          if (index >= 0) {
            streamingToolCalls[index].args = payload.args;
          } else {
            streamingToolCalls = [...streamingToolCalls, {
              id: payload.toolCallId,
              name: payload.toolName,
              args: payload.args,
              state: 'running'
            }];
          }
          if (!streamingMessage) {
            streamingMessage = {
              id: Math.random().toString(36).slice(2),
              sender: 'Skyth',
              content: streamingContent,
              toolCalls: streamingToolCalls,
              timestamp: new Date().toLocaleTimeString(),
              isOwn: false
            };
            isLoading = false;
          } else {
            streamingMessage = { ...streamingMessage, toolCalls: streamingToolCalls };
          }
        } else if (payload.type === 'tool-result') {
          const index = streamingToolCalls.findIndex(tc => tc.id === payload.toolCallId);
          if (index >= 0) {
            streamingToolCalls[index].state = 'completed';
            streamingToolCalls[index].result = payload.result;
            if (streamingMessage) {
              streamingMessage = { ...streamingMessage, toolCalls: streamingToolCalls };
            }
          }
        }"""

code = code.replace("        } else if (payload.type === 'reasoning-delta' && payload.text) {", tool_handling + "\n        } else if (payload.type === 'reasoning-delta' && payload.text) {")

# Reset tool calls on message
code = code.replace("""        streamingMessage = null;
        streamingContent = '';
        streamingReasoning = '';""", """        streamingMessage = null;
        streamingContent = '';
        streamingReasoning = '';
        streamingToolCalls = [];""")

# Forward tool calls from payload metadata
code = code.replace("""          content: payload.content,
          reasoning: payload.metadata?.reasoning,
          timestamp: new Date(payload.timestamp).toLocaleTimeString(),
          isOwn: false
        }];""", """          content: payload.content,
          reasoning: payload.metadata?.reasoning,
          toolCalls: payload.metadata?.tool_calls?.map((tc: any) => ({
            id: tc.id,
            name: tc.name,
            args: JSON.stringify(tc.arguments, null, 2),
            state: 'completed'
          })),
          timestamp: new Date(payload.timestamp).toLocaleTimeString(),
          isOwn: false
        }];""")


with open("platforms/web/src/lib/components/Chat.svelte", "w") as f:
    f.write(code)
