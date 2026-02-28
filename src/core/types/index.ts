export type AgentStatus = 'idle' | 'busy' | 'error' | 'stopped';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high' | 'critical';
export type TaskDependencyType = 'blocks' | 'after' | 'requires';
export type MessageType = 'request' | 'response' | 'broadcast' | 'event';
export type WorkflowNodeType = 'task' | 'condition' | 'loop' | 'parallel' | 'human' | 'switch';

export interface Capability {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface Agent {
  id: string;
  name: string;
  domain: string;
  description: string;
  capabilities: Capability[];
  status: AgentStatus;
  metadata: Record<string, unknown>;
  currentTasks?: number;
  maxConcurrentTasks?: number;
  createdAt: Date;
  updatedAt: Date;
  soul?: AgentSOUL;
}

export interface AgentSOUL {
  role: string;
  personality: string;
  expertise: string[];
  workingStyle: string;
  communicationStyle: string;
  goals: string[];
  constraints: string[];
  defaultPrompt?: string;
}

export interface AgentWorkflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  createdAt: Date;
  status: 'active' | 'paused' | 'completed';
}

export interface WorkflowStep {
  id: string;
  agentId: string;
  action: string;
  input: Record<string, unknown>;
  dependsOn: string[];
  onSuccess?: string;
  onFailure?: string;
}

export interface Task {
  id: string;
  name: string;
  description: string;
  requiredCapabilities: string[];
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  status: TaskStatus;
  priority: TaskPriority;
  assignedAgentId?: string;
  dependencies: string[];
  dependencyType?: TaskDependencyType;
  retryCount: number;
  maxRetries: number;
  timeout?: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface Message {
  id: string;
  type: MessageType;
  senderId: string;
  receiverId?: string;
  topic?: string;
  payload: Record<string, unknown>;
  correlationId?: string;
  timestamp: Date;
  persistent: boolean;
}

export interface KnowledgeEntry {
  id: string;
  content: string;
  embedding?: number[];
  metadata: Record<string, unknown>;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface KnowledgeVersion {
  entryId: string;
  version: number;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  changeType: 'created' | 'updated' | 'deleted';
}

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  name?: string;
  config: Record<string, unknown>;
  next?: string[];
  condition?: string;
  branches?: Record<string, string>;
  maxIterations?: number;
  humanApproval?: boolean;
  approvalMessage?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  startNode: string;
  variables: Record<string, unknown>;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused' | 'waiting_approval';
  currentNode?: string;
  variables: Record<string, unknown>;
  results: Map<string, unknown>;
  createdAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface Metric {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: Date;
}

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  agentId?: string;
  taskId?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}
