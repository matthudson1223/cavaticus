import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useChatStore } from '../../stores/chatStore';
import { useProjectStore } from '../../stores/projectStore';
import { useDebugStore, type DebugMessage } from '../../stores/debugStore';
import { WS_EVENTS } from '@cavaticus/shared';
import type { ChatMessage, UserModel } from '@cavaticus/shared';
import { getSocket } from '../../lib/socket';
import { api } from '../../lib/api';
import { debug } from '../../lib/debug';

export function ChatPanel() {
  const messages = useChatStore((s) => s.messages);
  const addMessage = useChatStore((s) => s.addMessage);
  const agentStatus = useChatStore((s) => s.agentStatus);
  const selectedModelId = useChatStore((s) => s.selectedModelId);
  const setSelectedModelId = useChatStore((s) => s.setSelectedModelId);
  const currentMessageId = useChatStore((s) => s.currentMessageId);
  const project = useProjectStore((s) => s.project);
  const debugMessages = useDebugStore((s) => s.messages);
  const [input, setInput] = useState('');
  const [showDebug, setShowDebug] = useState(false);
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

  function cancelAgent() {
    if (!currentMessageId) return;
    debug('ui', `Sending cancel for messageId=${currentMessageId}`);
    getSocket().emit(WS_EVENTS.CHAT_CANCEL, {
      messageId: currentMessageId,
    });
  }

  return (
    <div
      className="flex flex-col h-full"
      style={{ borderLeft: '1px solid var(--border)' }}
    >
      <div className="px-3 py-2 text-xs font-medium uppercase tracking-wider flex items-center justify-between" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
        <div>
          Chat
          {agentStatus !== 'idle' && (
            <span className="ml-2 text-yellow-400">● {agentStatus}</span>
          )}
        </div>
        {debugMessages.length > 0 && (
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="text-xs px-2 py-1 rounded"
            style={{
              background: showDebug ? 'var(--accent)' : 'var(--bg-3)',
              color: showDebug ? '#fff' : 'var(--text-muted)',
            }}
          >
            🐛 {debugMessages.length}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', paddingTop: '2rem' }}>
            Start a conversation...
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {showDebug && debugMessages.map((dbg) => (
          <DebugBubble key={dbg.id} debug={dbg} />
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
        {agentStatus === 'idle' ? (
          <button
            onClick={sendMessage}
            disabled={!input.trim()}
            className="mt-2 w-full py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            Send
          </button>
        ) : (
          <button
            onClick={cancelAgent}
            className="mt-2 w-full py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{ background: '#ef4444', color: '#fff' }}
          >
            Stop
          </button>
        )}
      </div>
    </div>
  );
}

function DebugBubble({ debug: dbg }: { debug: DebugMessage }) {
  const time = new Date(dbg.timestamp).toLocaleTimeString();
  const [collapsed, setCollapsed] = useState(true);

  // Color code by component
  const componentColors: Record<string, string> = {
    store: '#8b5cf6',
    ws: '#06b6d4',
    ui: '#ec4899',
    agent: '#f59e0b',
    api: '#10b981',
  };

  const componentColor = componentColors[dbg.component] || '#888';

  // Format data output
  const dataStr = dbg.data ? JSON.stringify(dbg.data, null, 2) : null;
  const hasData = dataStr && dataStr.length > 2;

  return (
    <div className="flex justify-start">
      <div
        className="max-w-[90%] rounded-lg overflow-hidden"
        style={{
          background: 'var(--bg-3)',
          border: `1px solid ${componentColor}40`,
        }}
      >
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full text-left px-3 py-2 hover:opacity-80 transition-opacity flex items-center gap-2"
          style={{
            background: `${componentColor}15`,
            color: componentColor,
          }}
        >
          <span style={{ fontSize: '12px' }}>{collapsed ? '▶' : '▼'}</span>
          <span style={{ fontSize: '11px', fontWeight: 600 }}>{dbg.component.toUpperCase()}</span>
          <span style={{ fontSize: '11px', color: '#888' }}>{time}</span>
          <span style={{ fontSize: '11px', color: '#666', marginLeft: 'auto' }}>
            {dbg.message.substring(0, 60)}{dbg.message.length > 60 ? '…' : ''}
          </span>
        </button>

        {!collapsed && (
          <div style={{ padding: '12px', borderTop: `1px solid ${componentColor}20` }}>
            <div style={{ color: '#aaa', fontSize: '12px', lineHeight: '1.5', fontFamily: 'monospace' }}>
              <div style={{ color: componentColor, fontWeight: 500, marginBottom: '8px' }}>
                {dbg.message}
              </div>

              {hasData && (
                <div
                  style={{
                    background: 'var(--bg-2)',
                    padding: '8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    overflow: 'auto',
                    maxHeight: '200px',
                    color: '#999',
                  }}
                >
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {dataStr}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
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
