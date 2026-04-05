import type { AgentRequest, FileChange } from '@cavaticus/shared';

const AGENT_URL = process.env['AGENT_SERVICE_URL'] ?? 'http://localhost:8000';

export interface AgentChunk {
  type: 'chunk';
  text: string;
}

export interface AgentDone {
  type: 'done';
  responseText: string;
  fileChanges: FileChange[];
}

export type AgentEvent = AgentChunk | AgentDone;

export async function* runAgent(
  request: AgentRequest,
): AsyncGenerator<AgentEvent> {
  const res = await fetch(`${AGENT_URL}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Agent returned ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const event = JSON.parse(trimmed) as AgentEvent;
      yield event;
    }
  }

  if (buffer.trim()) {
    yield JSON.parse(buffer) as AgentEvent;
  }
}
