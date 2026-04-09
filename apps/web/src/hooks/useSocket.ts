import { useEffect } from 'react';
import { getSocket } from '../lib/socket';
import { debug, onDebug } from '../lib/debug';
import { WS_EVENTS } from '@cavaticus/shared';
import type {
  ChatChunkPayload,
  ChatDonePayload,
  FileChangedPayload,
  AgentStatusPayload,
  AgentToolUsePayload,
  AgentThinkingPayload,
} from '@cavaticus/shared';
import { useChatStore } from '../stores/chatStore';
import { useProjectStore } from '../stores/projectStore';
import { useDebugStore } from '../stores/debugStore';

export function useSocket(projectId: string) {
  const appendChunk = useChatStore((s) => s.appendChunk);
  const replaceMessage = useChatStore((s) => s.replaceMessage);
  const setAgentStatus = useChatStore((s) => s.setAgentStatus);
  const addMessage = useChatStore((s) => s.addMessage);
  const setCurrentMessageId = useChatStore((s) => s.setCurrentMessageId);
  const addToolStep = useChatStore((s) => s.addToolStep);
  const setThinking = useChatStore((s) => s.setThinking);
  const completeActivity = useChatStore((s) => s.completeActivity);
  const upsertFile = useProjectStore((s) => s.upsertFile);
  const addDebugMessage = useDebugStore((s) => s.addMessage);

  useEffect(() => {
    // Subscribe to debug events
    const unsubscribeDebug = onDebug((component, message, data) => {
      addDebugMessage(component, message, data);
    });

    const socket = getSocket();
    if (!socket.connected) socket.connect();

    function onChunk(payload: ChatChunkPayload) {
      debug('ws', `CHAT_CHUNK: ${payload.chunk.length} chars`, { messageId: payload.messageId });
      setCurrentMessageId(payload.messageId);
      appendChunk(payload.messageId, payload.chunk);
    }
    function onDone(payload: ChatDonePayload) {
      debug('ws', `CHAT_DONE: message received`, payload.message);
      replaceMessage(payload.message);
      completeActivity(payload.messageId, payload.fileChanges ?? []);
      setCurrentMessageId(null);
    }
    function onFileChanged(payload: FileChangedPayload) {
      debug('ws', `FILE_CHANGED: ${payload.file.path}`);
      if (payload.projectId === projectId) {
        upsertFile(payload.file);
      }
    }
    function onStatus(payload: AgentStatusPayload) {
      debug('ws', `AGENT_STATUS: ${payload.status}`);
      setAgentStatus(payload.status);
    }
    function onToolUse(payload: AgentToolUsePayload) {
      debug('ws', `AGENT_TOOL_USE: ${payload.toolName}`, { messageId: payload.messageId });
      addToolStep(payload.messageId, payload.toolName);
    }
    function onThinking(payload: AgentThinkingPayload) {
      debug('ws', `AGENT_THINKING: ${payload.text.length} chars`);
      setThinking(payload.messageId, payload.text);
    }
    function onError(payload: { error: string }) {
      debug('ws', `AGENT_ERROR: ${payload.error}`);
      console.error('Agent error:', payload.error);
      setAgentStatus('idle');
      setCurrentMessageId(null);
    }

    socket.on(WS_EVENTS.CHAT_CHUNK, onChunk);
    socket.on(WS_EVENTS.CHAT_DONE, onDone);
    socket.on(WS_EVENTS.FILE_CHANGED, onFileChanged);
    socket.on(WS_EVENTS.AGENT_STATUS, onStatus);
    socket.on(WS_EVENTS.AGENT_TOOL_USE, onToolUse);
    socket.on(WS_EVENTS.AGENT_THINKING, onThinking);
    socket.on(WS_EVENTS.AGENT_ERROR, onError);

    return () => {
      unsubscribeDebug();
      socket.off(WS_EVENTS.CHAT_CHUNK, onChunk);
      socket.off(WS_EVENTS.CHAT_DONE, onDone);
      socket.off(WS_EVENTS.FILE_CHANGED, onFileChanged);
      socket.off(WS_EVENTS.AGENT_STATUS, onStatus);
      socket.off(WS_EVENTS.AGENT_TOOL_USE, onToolUse);
      socket.off(WS_EVENTS.AGENT_THINKING, onThinking);
      socket.off(WS_EVENTS.AGENT_ERROR, onError);
    };
  }, [projectId]);

  return getSocket();
}
