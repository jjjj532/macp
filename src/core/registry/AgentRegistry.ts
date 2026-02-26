import { Agent, AgentStatus, Capability } from '../types';
import { EventEmitter } from 'events';

export class AgentRegistry extends EventEmitter {
  private agents: Map<string, Agent> = new Map();
  private capabilityIndex: Map<string, Set<string>> = new Map();

  async register(agent: Omit<Agent, 'createdAt' | 'updatedAt'>): Promise<Agent> {
    const fullAgent: Agent = {
      ...agent,
      createdAt: new Date(),
      updatedAt: new Date(),
      currentTasks: 0,
      maxConcurrentTasks: agent.maxConcurrentTasks || 5,
    };
    this.agents.set(agent.id, fullAgent);
    this.indexCapabilities(agent.id, agent.capabilities);
    this.emit('agent:registered', fullAgent);
    return fullAgent;
  }

  async unregister(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      this.removeCapabilities(agentId, agent.capabilities);
      this.agents.delete(agentId);
      this.emit('agent:unregistered', agentId);
    }
  }

  async updateStatus(agentId: string, status: AgentStatus): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = status;
      agent.updatedAt = new Date();
      this.emit('agent:statusChanged', { agentId, status });
    }
  }

  async incrementTaskCount(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.currentTasks = (agent.currentTasks || 0) + 1;
      agent.updatedAt = new Date();
    }
  }

  async decrementTaskCount(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent && agent.currentTasks && agent.currentTasks > 0) {
      agent.currentTasks--;
      agent.updatedAt = new Date();
    }
  }

  async update(agentId: string, updates: Partial<Agent>): Promise<Agent | null> {
    const agent = this.agents.get(agentId);
    if (!agent) return null;
    
    Object.assign(agent, updates, { updatedAt: new Date() });
    
    if (updates.capabilities) {
      this.removeCapabilities(agentId, agent.capabilities);
      this.indexCapabilities(agentId, updates.capabilities);
      agent.capabilities = updates.capabilities;
    }
    
    this.emit('agent:updated', agent);
    return agent;
  }

  get(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  getAll(): Agent[] {
    return Array.from(this.agents.values());
  }

  findByCapability(capability: string): Agent[] {
    const agentIds = this.capabilityIndex.get(capability);
    if (!agentIds) return [];
    return Array.from(agentIds).map(id => this.agents.get(id)).filter(Boolean) as Agent[];
  }

  findByDomain(domain: string): Agent[] {
    return this.getAll().filter(a => a.domain === domain);
  }

  findAvailable(capabilities: string[]): Agent[] {
    return this.getAll().filter(agent => {
      if (agent.status !== 'idle') return false;
      if (agent.currentTasks && agent.maxConcurrentTasks && agent.currentTasks >= agent.maxConcurrentTasks) return false;
      return capabilities.every(cap => 
        agent.capabilities.some(ac => ac.name === cap)
      );
    });
  }

  getAllCapabilities(): string[] {
    return Array.from(this.capabilityIndex.keys());
  }

  getAgentCountByStatus(): Record<AgentStatus, number> {
    const agents = this.getAll();
    return {
      idle: agents.filter(a => a.status === 'idle').length,
      busy: agents.filter(a => a.status === 'busy').length,
      error: agents.filter(a => a.status === 'error').length,
      stopped: agents.filter(a => a.status === 'stopped').length,
    };
  }

  private indexCapabilities(agentId: string, capabilities: Capability[]): void {
    for (const cap of capabilities) {
      if (!this.capabilityIndex.has(cap.name)) {
        this.capabilityIndex.set(cap.name, new Set());
      }
      this.capabilityIndex.get(cap.name)!.add(agentId);
    }
  }

  private removeCapabilities(agentId: string, capabilities: Capability[]): void {
    for (const cap of capabilities) {
      this.capabilityIndex.get(cap.name)?.delete(agentId);
    }
  }
}
