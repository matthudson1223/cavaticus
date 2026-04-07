from pydantic import BaseModel
from typing import Literal, Optional


class Attachment(BaseModel):
    type: Literal["image"]
    mimeType: str
    data: str  # base64


class ProjectFile(BaseModel):
    path: str
    content: str


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AgentRequest(BaseModel):
    provider: str  # "claude" | "openai" | "gemini" | "openrouter" | "unified"
    apiKey: str
    projectFiles: list[ProjectFile]
    chatHistory: list[ChatTurn]
    userMessage: str
    attachments: Optional[list[Attachment]] = None
    openrouterModel: Optional[str] = None
    projectId: str = ""
    # Unified provider fields
    model: str = ""             # e.g. "claude-opus-4-6", "gpt-4o", "ollama/llama3.3"
    customBaseUrl: str = ""     # for provider="custom"


class FileChange(BaseModel):
    path: str
    action: Literal["created", "modified", "deleted"]
    content: Optional[str] = None


class AgentResponse(BaseModel):
    responseText: str
    fileChanges: list[FileChange]
