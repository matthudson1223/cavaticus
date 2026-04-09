import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useChatStore, type MessageActivity } from '../../stores/chatStore';
import { useProjectStore } from '../../stores/projectStore';
import { useDebugStore, type DebugMessage } from '../../stores/debugStore';
import { WS_EVENTS } from '@cavaticus/shared';
import type { ChatMessage, UserModel } from '@cavaticus/shared';
import { getSocket } from '../../lib/socket';
import { api } from '../../lib/api';
import { debug } from '../../lib/debug';

/** Human-readable labels for tool names */
const TOOL_LABELS: Record<string, string> = {
  read_file: 'Reading file',
  write_file: 'Writing file',
  create_file: 'Creating file',
  delete_file: 'Deleting file',
  list_files: 'Listing files',
  search_files: 'Searching files',
  edit_file: 'Editing file',
  run_shell: 'Running command',
  analyze_code: 'Analyzing code',
  web_search: 'Searching the web',
  web_fetch: 'Fetching page',
  create_task: 'Creating task',
  update_task: 'Updating task',
  list_tasks: 'Checking tasks',
  save_memory: 'Saving memory',
  recall_memory: 'Recalling memory',
};

function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/_/g, ' ');
}

export function ChatPanel() {
  const messages = useChatStore((s) => s.messages);
  const addMessage = useChatStore((s) => s.addMessage);
  const agentStatus = useChatStore((s) => s.agentStatus);
  const selectedModelId = useChatStore((s) => s.selectedModelId);
  const setSelectedModelId = useChatStore((s) => s.setSelectedModelId);
  const currentMessageId = useChatStore((s) => s.currentMessageId);
  const activity = useChatStore((s) => s.activity);
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
  }, [messages, agentStatus, activity]);

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

  // Find the active assistant message's activity (for thinking/tool display)
  const activeActivity = currentMessageId ? activity[currentMessageId] : null;

  return (
    <div
      className="flex flex-col h-full"
      style={{ borderLeft: '1px solid var(--border)' }}
    >
      {/* Header */}
      <div
        className="px-3 py-2 text-xs font-medium uppercase tracking-wider flex items-center justify-between shrink-0"
        style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2">
          Chat
          {agentStatus !== 'idle' && (
            <AgentStatusBadge status={agentStatus} />
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
            Debug {debugMessages.length}
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div
            className="flex flex-col items-center justify-center pt-12 text-center"
            style={{ color: 'var(--text-muted)' }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, marginBottom: '12px' }}>
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            <p className="text-sm">Ask the AI to modify your site</p>
            <p className="text-xs mt-1" style={{ opacity: 0.6 }}>
              Try "add a navigation bar" or "make it responsive"
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            activity={activity[msg.id]}
            isStreaming={msg.id === currentMessageId}
          />
        ))}

        {/* Live activity indicator while agent is working */}
        {agentStatus !== 'idle' && activeActivity && (
          <LiveActivityIndicator activity={activeActivity} status={agentStatus} />
        )}

        {showDebug && debugMessages.map((dbg) => (
          <DebugBubble key={dbg.id} debug={dbg} />
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="p-3 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
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
            placeholder="Ask the AI to modify your site..."
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

/* ── Agent status badge ─────────────────────────────────── */

function AgentStatusBadge({ status }: { status: 'thinking' | 'coding' }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{
        background: status === 'thinking' ? 'rgba(250, 204, 21, 0.15)' : 'rgba(99, 102, 241, 0.15)',
        color: status === 'thinking' ? '#facc15' : 'var(--accent)',
      }}
    >
      <span className="thinking-dot" />
      {status === 'thinking' ? 'Thinking' : 'Coding'}
    </span>
  );
}

/* ── Live activity indicator (shown below messages while agent works) ── */

function LiveActivityIndicator({
  activity,
  status,
}: {
  activity: MessageActivity;
  status: 'thinking' | 'coding';
}) {
  const { toolSteps } = activity;
  const latestTool = toolSteps.length > 0 ? toolSteps[toolSteps.length - 1] : null;

  return (
    <div className="flex justify-start">
      <div
        className="rounded-lg px-3 py-2 text-xs space-y-1.5"
        style={{ background: 'var(--bg-3)', maxWidth: '85%' }}
      >
        {/* Animated thinking/working indicator */}
        <div className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
          <ThinkingDots />
          <span>
            {status === 'thinking' && toolSteps.length === 0
              ? 'Thinking...'
              : latestTool
                ? toolLabel(latestTool.toolName) + '...'
                : 'Working...'}
          </span>
        </div>

        {/* Recent tool steps */}
        {toolSteps.length > 1 && (
          <div className="space-y-0.5 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
            {toolSteps.slice(-5, -1).map((step, i) => (
              <div key={i} className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>{toolLabel(step.toolName)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Thinking dots animation ────────────────────────────── */

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="thinking-dot" style={{ animationDelay: '0ms' }} />
      <span className="thinking-dot" style={{ animationDelay: '150ms' }} />
      <span className="thinking-dot" style={{ animationDelay: '300ms' }} />
    </span>
  );
}

/* ── Workflow summary (shown after assistant message when activity is complete) ── */

function WorkflowSummary({ activity }: { activity: MessageActivity }) {
  const [expanded, setExpanded] = useState(false);
  const { toolSteps, fileChanges, startedAt, completedAt } = activity;

  if (toolSteps.length === 0 && fileChanges.length === 0) return null;

  const duration = completedAt ? ((completedAt - startedAt) / 1000).toFixed(1) : null;

  const created = fileChanges.filter((f) => f.action === 'created');
  const modified = fileChanges.filter((f) => f.action === 'modified');
  const deleted = fileChanges.filter((f) => f.action === 'deleted');

  return (
    <div
      className="mt-2 rounded-lg overflow-hidden text-xs"
      style={{ background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.15)' }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-left transition-colors"
        style={{ color: 'var(--text-muted)' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(99, 102, 241, 0.05)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <span className="flex items-center gap-2">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span style={{ color: 'var(--text)' }}>
            {summaryText(toolSteps.length, fileChanges.length, duration)}
          </span>
        </span>
        <svg
          width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.15s' }}
        >
          <path d="M3 5L6 8L9 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {expanded && (
        <div className="px-3 pb-2 space-y-2" style={{ borderTop: '1px solid rgba(99, 102, 241, 0.1)' }}>
          {/* File changes */}
          {fileChanges.length > 0 && (
            <div className="pt-2 space-y-1">
              <p className="font-medium" style={{ color: 'var(--text-muted)' }}>Files changed</p>
              {created.map((f) => (
                <FileChangeLine key={f.path} action="created" path={f.path} />
              ))}
              {modified.map((f) => (
                <FileChangeLine key={f.path} action="modified" path={f.path} />
              ))}
              {deleted.map((f) => (
                <FileChangeLine key={f.path} action="deleted" path={f.path} />
              ))}
            </div>
          )}

          {/* Tool steps */}
          {toolSteps.length > 0 && (
            <div className="space-y-1">
              <p className="font-medium" style={{ color: 'var(--text-muted)' }}>Steps</p>
              {toolSteps.map((step, i) => (
                <div key={i} className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {toolLabel(step.toolName)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FileChangeLine({ action, path }: { action: string; path: string }) {
  const colors: Record<string, string> = {
    created: '#22c55e',
    modified: '#facc15',
    deleted: '#ef4444',
  };
  const icons: Record<string, string> = {
    created: '+',
    modified: '~',
    deleted: '-',
  };

  return (
    <div className="flex items-center gap-1.5 font-mono" style={{ color: 'var(--text-muted)' }}>
      <span style={{ color: colors[action], fontWeight: 600, width: '10px', textAlign: 'center' }}>
        {icons[action]}
      </span>
      <span>{path}</span>
    </div>
  );
}

function summaryText(steps: number, files: number, duration: string | null): string {
  const parts: string[] = [];
  if (steps > 0) parts.push(`${steps} step${steps !== 1 ? 's' : ''}`);
  if (files > 0) parts.push(`${files} file${files !== 1 ? 's' : ''} changed`);
  if (duration) parts.push(`${duration}s`);
  return parts.join(' · ');
}

/* ── Message bubble ─────────────────────────────────────── */

function MessageBubble({
  message,
  activity,
  isStreaming,
}: {
  message: ChatMessage;
  activity?: MessageActivity;
  isStreaming?: boolean;
}) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={isUser ? 'max-w-[85%]' : 'max-w-[90%] w-full'}>
        <div
          className="rounded-xl px-3 py-2 text-sm"
          style={{
            background: isUser ? 'var(--accent)' : 'var(--bg-3)',
            color: 'var(--text)',
          }}
        >
          {!message.content && isStreaming ? (
            <span className="inline-flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
              <ThinkingDots />
            </span>
          ) : !message.content ? (
            <span style={{ color: 'var(--text-muted)' }}>...</span>
          ) : isUser ? (
            <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
          ) : (
            <MarkdownContent content={message.content} />
          )}
        </div>

        {/* Workflow summary for completed assistant messages */}
        {!isUser && activity?.completedAt && (
          <WorkflowSummary activity={activity} />
        )}
      </div>
    </div>
  );
}

/* ── Markdown renderer ──────────────────────────────────── */

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      className="markdown-content"
      components={{
        code(props: any) {
          const { inline, className, children } = props;
          const match = /language-(\w+)/.exec(className || '');
          const language = match?.[1] || 'text';
          return !inline ? (
            <SyntaxHighlighter style={oneDark} language={language}>
              {String(children).replace(/\n$/, '')}
            </SyntaxHighlighter>
          ) : (
            <code
              className={className}
              style={{
                background: 'var(--bg-2)',
                padding: '1px 4px',
                borderRadius: '3px',
                fontSize: '0.9em',
              }}
            >
              {children}
            </code>
          );
        },
        a: ({ ...props }) => (
          <a
            {...props}
            style={{
              color: 'var(--accent)',
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
          />
        ),
        blockquote: ({ ...props }) => (
          <blockquote
            {...props}
            style={{
              borderLeft: '3px solid var(--accent)',
              paddingLeft: '0.75rem',
              marginLeft: 0,
              opacity: 0.8,
            }}
          />
        ),
        ul: ({ ...props }) => (
          <ul {...props} style={{ paddingLeft: '1.5rem', margin: '0.5rem 0' }} />
        ),
        ol: ({ ...props }) => (
          <ol {...props} style={{ paddingLeft: '1.5rem', margin: '0.5rem 0' }} />
        ),
        h1: ({ ...props }) => (
          <h1 {...props} style={{ fontSize: '1.5rem', fontWeight: 'bold', marginTop: '0.75rem' }} />
        ),
        h2: ({ ...props }) => (
          <h2 {...props} style={{ fontSize: '1.25rem', fontWeight: 'bold', marginTop: '0.5rem' }} />
        ),
        h3: ({ ...props }) => (
          <h3 {...props} style={{ fontSize: '1.1rem', fontWeight: 'bold', marginTop: '0.5rem' }} />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

/* ── Debug bubble ───────────────────────────────────────── */

function DebugBubble({ debug: dbg }: { debug: DebugMessage }) {
  const time = new Date(dbg.timestamp).toLocaleTimeString();
  const [collapsed, setCollapsed] = useState(true);

  const componentColors: Record<string, string> = {
    store: '#8b5cf6',
    ws: '#06b6d4',
    ui: '#ec4899',
    agent: '#f59e0b',
    api: '#10b981',
  };

  const componentColor = componentColors[dbg.component] || '#888';
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
          <span style={{ fontSize: '12px' }}>{collapsed ? '>' : 'v'}</span>
          <span style={{ fontSize: '11px', fontWeight: 600 }}>{dbg.component.toUpperCase()}</span>
          <span style={{ fontSize: '11px', color: '#888' }}>{time}</span>
          <span style={{ fontSize: '11px', color: '#666', marginLeft: 'auto' }}>
            {dbg.message.substring(0, 60)}{dbg.message.length > 60 ? '...' : ''}
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
