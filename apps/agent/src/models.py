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


class Task(BaseModel):
    id: str
    subject: str
    description: Optional[str] = None
    status: Literal["pending", "in_progress", "completed", "cancelled"] = "pending"
    activeForm: Optional[str] = None
    blocks: list[str] = []
    blockedBy: list[str] = []
    metadata: dict = {}


class Memory(BaseModel):
    name: str
    content: str
    type: Literal["user", "feedback", "project", "reference"] = "project"
    description: Optional[str] = None
    confidence: float = 1.0
    created_at: Optional[float] = None


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
    # Task/Memory/Skill systems
    existingTasks: list[Task] = []
    projectMemory: dict[str, Memory] = {}
    activeSkill: Optional[str] = None


class FileChange(BaseModel):
    path: str
    action: Literal["created", "modified", "deleted"]
    content: Optional[str] = None


class AgentResponse(BaseModel):
    responseText: str
    fileChanges: list[FileChange]
    taskUpdates: list[Task] = []
    memoryUpdates: dict[str, Optional[Memory]] = {}
