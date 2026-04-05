import { useEffect } from 'react';
import { getSocket } from '../lib/socket';
import { WS_EVENTS } from '@cavaticus/shared';
import type {
  ChatChunkPayload,
  ChatDonePayload,
  FileChangedPayload,
  AgentStatusPayload,
} from '@cavaticus/shared';
import { useChatStore } from '../stores/chatStore';
import { useProjectStore } from '../stores/projectStore';

export function useSocket(projectId: string) {
  const appendChunk = useChatStore((s) => s.appendChunk);
  const replaceMessage = useChatStore((s) => s.replaceMessage);
  const setAgentStatus = useChatStore((s) => s.setAgentStatus);
  const addMessage = useChatStore((s) => s.addMessage);
  const upsertFile = useProjectStore((s) => s.upsertFile);

  useEffect(() => {
    const socket = getSocket();
    if (!socket.connected) socket.connect();

    function onChunk(payload: ChatChunkPayload) {
      appendChunk(payload.messageId, payload.chunk);
    }
    function onDone(payload: ChatDonePayload) {
      replaceMessage(payload.message);
    }
    function onFileChanged(payload: FileChangedPayload) {
      if (payload.projectId === projectId) {
        upsertFile(payload.file);
      }
    }
    function onStatus(payload: AgentStatusPayload) {
      setAgentStatus(payload.status);
    }
    function onError(payload: { error: string }) {
      console.error('Agent error:', payload.error);
      setAgentStatus('idle');
    }

    socket.on(WS_EVENTS.CHAT_CHUNK, onChunk);
    socket.on(WS_EVENTS.CHAT_DONE, onDone);
    socket.on(WS_EVENTS.FILE_CHANGED, onFileChanged);
    socket.on(WS_EVENTS.AGENT_STATUS, onStatus);
    socket.on(WS_EVENTS.AGENT_ERROR, onError);

    return () => {
      socket.off(WS_EVENTS.CHAT_CHUNK, onChunk);
      socket.off(WS_EVENTS.CHAT_DONE, onDone);
      socket.off(WS_EVENTS.FILE_CHANGED, onFileChanged);
      socket.off(WS_EVENTS.AGENT_STATUS, onStatus);
      socket.off(WS_EVENTS.AGENT_ERROR, onError);
    };
  }, [projectId, appendChunk, replaceMessage, setAgentStatus, addMessage, upsertFile]);

  return getSocket();
}
