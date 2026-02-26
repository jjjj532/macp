import { Agent, AgentStatus, Capability, Task } from '../types';
import { AgentRegistry } from '../registry/AgentRegistry';
import { EventEmitter } from 'events';

export interface AgentConfig {
  id: string;
  name: string;
  domain: string;
  description: string;
  capabilities: Capability[];
  executor: AgentExecutor;
  metadata?: Record<string, unknown>;
  maxConcurrentTasks?: number;
}

export interface AgentExecutor {
  execute(task: Task): Promise<Record<string, unknown>>;
  validate?(input: Record<string, unknown>): boolean;
  onMessage?(message: unknown): void;
  onTaskComplete?(taskId: string, result: Record<string, unknown>): void;
  onTaskFail?(taskId: string, error: string): void;
}

export class AgentManager extends EventEmitter {
  private registry: AgentRegistry;
  private executors: Map<string, AgentExecutor> = new Map();
  private agentTasks: Map<string, Set<string>> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private agentLoadScores: Map<string, number> = new Map();

  constructor(registry: AgentRegistry) {
    super();
    this.registry = registry;
  }

  async createAgent(config: AgentConfig): Promise<Agent> {
    if (this.executors.has(config.id)) {
      throw new Error('Executor for agent ' + config.id + ' already registered');
    }

    const agent = await this.registry.register({
      id: config.id,
      name: config.name,
      domain: config.domain,
      description: config.description,
      capabilities: config.capabilities,
      status: 'idle',
      metadata: config.metadata || {},
      maxConcurrentTasks: config.maxConcurrentTasks || 5,
    });

    this.executors.set(config.id, config.executor);
    this.agentTasks.set(config.id, new Set());
    this.emit('agent:created', agent);
    return agent;
  }

  getExecutor(agentId: string): AgentExecutor | undefined {
    return this.executors.get(agentId);
  }

  async startAgent(agentId: string): Promise<void> {
    await this.registry.updateStatus(agentId, 'idle');
    this.emit('agent:started', agentId);
  }

  async stopAgent(agentId: string): Promise<void> {
    const agent = this.registry.get(agentId);
    if (!agent) throw new Error('Agent ' + agentId + ' not found');
    
    if (agent.status === 'busy') {
      throw new Error('Cannot stop agent ' + agentId + ' while busy');
    }
    
    await this.registry.updateStatus(agentId, 'stopped');
    this.emit('agent:stopped', agentId);
  }

  async assignTask(agentId: string, task: Task): Promise<void> {
    const agent = this.registry.get(agentId);
    if (!agent) throw new Error('Agent ' + agentId + ' not found');
    if (agent.status !== 'idle') throw new Error('Agent ' + agentId + ' is not idle');

    const tasks = this.agentTasks.get(agentId) || new Set();
    if (agent.maxConcurrentTasks && tasks.size >= agent.maxConcurrentTasks) {
      throw new Error('Agent ' + agentId + ' has reached max concurrent tasks');
    }

    await this.registry.updateStatus(agentId, 'busy');
    tasks.add(task.id);
    this.agentTasks.set(agentId, tasks);
    task.assignedAgentId = agentId;
    
    this.emit('task:assigned', { agentId, task });
  }

  async completeTask(agentId: string, taskId: string, result: Record<string, unknown>): Promise<void> {
    const tasks = this.agentTasks.get(agentId);
    if (tasks) {
      tasks.delete(taskId);
    }
    
    if (!tasks || tasks.size === 0) {
      await this.registry.updateStatus(agentId, 'idle');
    }
    
    const executor = this.executors.get(agentId);
    if (executor?.onTaskComplete) {
      executor.onTaskComplete(taskId, result);
    }
    
    this.emit('task:completed', { agentId, taskId, result });
  }

  async failTask(agentId: string, taskId: string, error: string): Promise<void> {
    const tasks = this.agentTasks.get(agentId);
    if (tasks) {
      tasks.delete(taskId);
    }
    
    if (!tasks || tasks.size === 0) {
      await this.registry.updateStatus(agentId, 'error');
    }
    
    const executor = this.executors.get(agentId);
    if (executor?.onTaskFail) {
      executor.onTaskFail(taskId, error);
    }
    
    this.emit('task:failed', { agentId, taskId, error });
  }

  async recoverAgent(agentId: string): Promise<void> {
    const tasks = this.agentTasks.get(agentId);
    if (!tasks || tasks.size === 0) {
      await this.registry.updateStatus(agentId, 'idle');
    }
  }

  async reassignTask(taskId: string, fromAgentId: string, toAgentId: string): Promise<void> {
    const fromTasks = this.agentTasks.get(fromAgentId);
    if (fromTasks) {
      fromTasks.delete(taskId);
    }
    
    const toTasks = this.agentTasks.get(toAgentId) || new Set();
    toTasks.add(taskId);
    this.agentTasks.set(toAgentId, toTasks);
    
    this.emit('task:reassigned', { taskId, fromAgentId, toAgentId });
  }

  getAgent(agentId: string): Agent | undefined {
    return this.registry.get(agentId);
  }

  getAllAgents(): Agent[] {
    return this.registry.getAll();
  }

  getAvailableAgents(capabilities: string[]): Agent[] {
    return this.registry.findAvailable(capabilities);
  }

  selectBestAgent(capabilities: string[]): Agent | null {
    const availableAgents = this.getAvailableAgents(capabilities);
    if (availableAgents.length === 0) return null;

    const scored = availableAgents.map(agent => {
      let score = 100;
      
      if (agent.maxConcurrentTasks && agent.currentTasks !== undefined) {
        const loadFactor = agent.currentTasks / agent.maxConcurrentTasks;
        score -= loadFactor * 50;
      }
      
      const hasAllCaps = capabilities.every(cap => 
        agent.capabilities.some(ac => ac.name === cap)
      );
      if (hasAllCaps) score += 30;

      const domainBonus: Record<string, number> = {
        'AI Assistant': 10,
        'Software Development': 10,
      };
      score += domainBonus[agent.domain] || 0;
      
      this.agentLoadScores.set(agent.id, score);
      
      return { agent, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.agent || null;
  }

  getAgentLoad(agentId: string): number {
    return this.agentLoadScores.get(agentId) || 0;
  }

  getAgentTasks(agentId: string): string[] {
    return Array.from(this.agentTasks.get(agentId) || []);
  }

  startHealthCheck(intervalMs: number = 30000): void {
    if (this.healthCheckInterval) return;
    
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, intervalMs);
    
    this.emit('healthCheck:started');
  }

  stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      this.emit('healthCheck:stopped');
    }
  }

  private async performHealthCheck(): Promise<void> {
    const agents = this.registry.getAll();
    
    for (const agent of agents) {
      if (agent.status === 'busy') {
        const tasks = this.agentTasks.get(agent.id);
        if (!tasks || tasks.size === 0) {
          await this.registry.updateStatus(agent.id, 'error');
          this.emit('agent:orphaned', agent.id);
        }
      }
    }
    
    this.emit('healthCheck:completed', {
      totalAgents: agents.length,
      idle: agents.filter(a => a.status === 'idle').length,
      busy: agents.filter(a => a.status === 'busy').length,
      error: agents.filter(a => a.status === 'error').length,
    });
  }
}
