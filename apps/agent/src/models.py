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
    provider: Literal["claude", "openai", "gemini"]
    apiKey: str
    projectFiles: list[ProjectFile]
    chatHistory: list[ChatTurn]
    userMessage: str
    attachments: Optional[list[Attachment]] = None


class FileChange(BaseModel):
    path: str
    action: Literal["created", "modified", "deleted"]
    content: Optional[str] = None


class AgentResponse(BaseModel):
    responseText: str
    fileChanges: list[FileChange]
