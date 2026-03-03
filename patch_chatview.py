import re

with open("platforms/web/src/lib/components/ChatView.svelte", "r") as f:
    code = f.read()

# Add Tool component imports
code = code.replace("""  import { Button } from "$lib/components/ui/button";
  import "$lib/assets/animations.css";""", """  import { Button } from "$lib/components/ui/button";
  import { Tool, ToolHeader, ToolInput, ToolOutput, ToolContent } from "$lib/components/tool";
  import "$lib/assets/animations.css";""")

# Update ChatMessage interface
code = code.replace("""  interface ChatMessage {
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

  interface ChatMessage {
    id: string;
    sender: string;
    content: string;
    reasoning?: string;
    toolCalls?: ToolCall[];
    timestamp: string;
    isOwn: boolean;
  }""")

# Add tool rendering block
tool_block = """              {#if msg.toolCalls && msg.toolCalls.length > 0}
                <div class="flex flex-col gap-2 mt-2">
                  {#each msg.toolCalls as tool (tool.id)}
                    <Tool>
                      <ToolHeader type={tool.name} state={tool.state === 'running' ? 'input-streaming' : 'output-available'} />
                      <ToolContent>
                        {#if tool.args}
                          <ToolInput input={(() => { try { return JSON.parse(tool.args) } catch { return tool.args } })()} />
                        {/if}
                        {#if tool.result}
                          <ToolOutput output={tool.result} />
                        {/if}
                      </ToolContent>
                    </Tool>
                  {/each}
                </div>
              {/if}"""

code = code.replace("""              {#if msg.reasoning}
                <Reasoning>
                  <ReasoningTrigger>Show AI reasoning</ReasoningTrigger>
                  <ReasoningContent content={msg.reasoning} markdown={true} />
                </Reasoning>
              {/if}
              <p>{msg.content}</p>""", """              {#if msg.reasoning}
                <Reasoning>
                  <ReasoningTrigger>Show AI reasoning</ReasoningTrigger>
                  <ReasoningContent content={msg.reasoning} markdown={true} />
                </Reasoning>
              {/if}
""" + tool_block + """
              <p>{msg.content}</p>""")


# Do the same for streaming messages
streaming_tool_block = """              {#if streamingMessage.toolCalls && streamingMessage.toolCalls.length > 0}
                <div class="flex flex-col gap-2 mt-2">
                  {#each streamingMessage.toolCalls as tool (tool.id)}
                    <Tool>
                      <ToolHeader type={tool.name} state={tool.state === 'running' ? 'input-streaming' : 'output-available'} />
                      <ToolContent>
                        {#if tool.args}
                          <ToolInput input={(() => { try { return JSON.parse(tool.args) } catch { return tool.args } })()} />
                        {/if}
                        {#if tool.result}
                          <ToolOutput output={tool.result} />
                        {/if}
                      </ToolContent>
                    </Tool>
                  {/each}
                </div>
              {/if}"""

code = code.replace("""              {#if streamingMessage.reasoning}
                <Reasoning>
                  <ReasoningTrigger>Show AI reasoning</ReasoningTrigger>
                  <ReasoningContent content={streamingMessage.reasoning} markdown={true} />
                </Reasoning>
              {/if}
              {#if streamingMessage.content}
                <p>{streamingMessage.content}</p>
              {/if}""", """              {#if streamingMessage.reasoning}
                <Reasoning>
                  <ReasoningTrigger>Show AI reasoning</ReasoningTrigger>
                  <ReasoningContent content={streamingMessage.reasoning} markdown={true} />
                </Reasoning>
              {/if}
""" + streaming_tool_block + """
              {#if streamingMessage.content}
                <p>{streamingMessage.content}</p>
              {/if}""")


with open("platforms/web/src/lib/components/ChatView.svelte", "w") as f:
    f.write(code)
