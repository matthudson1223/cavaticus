import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useChatStore } from '../../stores/chatStore';
import { useProjectStore } from '../../stores/projectStore';
import { WS_EVENTS } from '@cavaticus/shared';
import type { ChatMessage, UserModel } from '@cavaticus/shared';
import { getSocket } from '../../lib/socket';
import { api } from '../../lib/api';

export function ChatPanel() {
  const messages = useChatStore((s) => s.messages);
  const addMessage = useChatStore((s) => s.addMessage);
  const agentStatus = useChatStore((s) => s.agentStatus);
  const selectedModelId = useChatStore((s) => s.selectedModelId);
  const setSelectedModelId = useChatStore((s) => s.setSelectedModelId);
  const project = useProjectStore((s) => s.project);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: modelsData } = useQuery({
    queryKey: ['models'],
    queryFn: () => api.get<{ models: UserModel[] }>('/api/v1/settings/models'),
  });
  const models = modelsData?.models || [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || !project || agentStatus !== 'idle') return;

    const tempMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      projectId: project.id,
      role: 'user',
      content: trimmed,
      attachments: [],
      createdAt: new Date().toISOString(),
    };
    addMessage(tempMsg);

    // Add optimistic assistant placeholder
    const assistantPlaceholder: ChatMessage = {
      id: `streaming-${Date.now()}`,
      projectId: project.id,
      role: 'assistant',
      content: '',
      attachments: [],
      createdAt: new Date().toISOString(),
    };
    addMessage(assistantPlaceholder);

    getSocket().emit(WS_EVENTS.CHAT_SEND, {
      projectId: project.id,
      content: trimmed,
      modelId: selectedModelId || undefined,
    });

    setInput('');
  }

  return (
    <div
      className="flex flex-col h-full"
      style={{ borderLeft: '1px solid var(--border)' }}
    >
      <div className="px-3 py-2 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
        Chat
        {agentStatus !== 'idle' && (
          <span className="ml-2 text-yellow-400">● {agentStatus}</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="p-3" style={{ borderTop: '1px solid var(--border)' }}>
        {models.length > 0 && (
          <div className="mb-3">
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
              Model
            </label>
            <select
              value={selectedModelId || ''}
              onChange={(e) => setSelectedModelId(e.target.value || null)}
              className="w-full px-2 py-1.5 rounded-lg text-sm"
              style={{
                background: 'var(--bg-3)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
              }}
            >
              <option value="">Default</option>
              {models.map((model) => (
                <option key={model.id} value={model.modelId}>
                  {model.label || model.modelId}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask the AI to modify your site…"
            rows={3}
            disabled={agentStatus !== 'idle'}
            className="flex-1 px-3 py-2 rounded-lg text-sm resize-none outline-none disabled:opacity-50"
            style={{
              background: 'var(--bg-3)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
            }}
          />
        </div>
        <button
          onClick={sendMessage}
          disabled={!input.trim() || agentStatus !== 'idle'}
          className="mt-2 w-full py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className="max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap"
        style={{
          background: isUser ? 'var(--accent)' : 'var(--bg-3)',
          color: 'var(--text)',
        }}
      >
        {message.content || (
          <span style={{ color: 'var(--text-muted)' }}>▍</span>
        )}
      </div>
    </div>
  );
}
