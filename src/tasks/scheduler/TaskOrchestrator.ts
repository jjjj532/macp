import { Task, TaskStatus, TaskPriority, Agent } from '../../core/types';
import { AgentManager, AgentExecutor } from '../../core/manager/AgentManager';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

EventEmitter.defaultMaxListeners = 20;

export interface TaskDecompositionResult {
  subtasks: Omit<Task, 'id'>[];
  dependencies: Map<string, string[]>;
}

export interface TaskDependency {
  taskId: string;
  dependsOn: string[];
  type: 'blocks' | 'after' | 'requires';
}

export interface TaskExecutionPlan {
  taskId: string;
  level: number;
  canRun: boolean;
}

export interface TaskConfig {
  name: string;
  description: string;
  requiredCapabilities: string[];
  input: Record<string, unknown>;
  priority?: TaskPriority;
  maxRetries?: number;
  dependencies?: string[];
  dependencyType?: 'blocks' | 'after' | 'requires';
  timeout?: number;
}

export class TaskOrchestrator extends EventEmitter {
  private agentManager: AgentManager;
  private tasks: Map<string, Task> = new Map();
  private taskQueue: Task[] = [];
  private runningTasks: Map<string, Task> = new Map();
  private completedTasks: Map<string, Task> = new Map();
  private failedTasks: Map<string, Task> = new Map();
  private maxConcurrent: number;
  private retryDelay: number;
  private dependencyGraph: Map<string, string[]> = new Map();
  private taskWaiters: Map<string, Set<string>> = new Map();

  constructor(agentManager: AgentManager, maxConcurrent: number = 10, retryDelay: number = 1000) {
    super();
    this.agentManager = agentManager;
    this.maxConcurrent = maxConcurrent;
    this.retryDelay = retryDelay;
  }

  async createTask(config: TaskConfig): Promise<Task> {
    const task: Task = {
      id: uuidv4(),
      name: config.name,
      description: config.description,
      requiredCapabilities: config.requiredCapabilities,
      input: config.input,
      status: 'pending',
      priority: config.priority || 'normal',
      dependencies: config.dependencies || [],
      dependencyType: config.dependencyType || 'requires',
      retryCount: 0,
      maxRetries: config.maxRetries || 3,
      timeout: config.timeout || 300000,
      createdAt: new Date(),
    };

    this.tasks.set(task.id, task);
    this.buildDependencyGraph(task);
    this.addToQueue(task);
    this.emit('task:created', task);
    
    return task;
  }

  private buildDependencyGraph(task: Task): void {
    if (task.dependencies && task.dependencies.length > 0) {
      this.dependencyGraph.set(task.id, task.dependencies);
      
      for (const depId of task.dependencies) {
        if (!this.taskWaiters.has(depId)) {
          this.taskWaiters.set(depId, new Set());
        }
        this.taskWaiters.get(depId)!.add(task.id);
      }
    }
  }

  async createTaskGroup(configs: TaskConfig[]): Promise<Task[]> {
    const tasks: Task[] = [];
    const taskIdMap: Map<string, string> = new Map();
    
    for (const config of configs) {
      const taskId = uuidv4();
      taskIdMap.set(config.name, taskId);
    }

    for (const config of configs) {
      const resolvedDeps = (config.dependencies || []).map(d => taskIdMap.get(d) || d);
      const task = await this.createTask({
        ...config,
        dependencies: resolvedDeps,
      });
      tasks.push(task);
    }

    return tasks;
  }

  async decomposeTask(task: Task): Promise<TaskDecompositionResult> {
    const subtasks: Omit<Task, 'id'>[] = [];
    const dependencies = new Map<string, string[]>();

    const inputKeys = Object.keys(task.input);
    if (inputKeys.length > 3) {
      const chunkSize = Math.ceil(inputKeys.length / 2);
      for (let i = 0; i < inputKeys.length; i += chunkSize) {
        const chunk = inputKeys.slice(i, i + chunkSize);
        const subtaskInput = chunk.reduce((acc, key) => {
          acc[key] = task.input[key];
          return acc;
        }, {} as Record<string, unknown>);

        const subtaskId = 'subtask-' + i;
        subtasks.push({
          name: task.name + '-' + subtaskId,
          description: 'Part of ' + task.name,
          requiredCapabilities: task.requiredCapabilities,
          input: subtaskInput,
          status: 'pending',
          priority: task.priority,
          dependencies: [],
          retryCount: 0,
          maxRetries: task.maxRetries,
          createdAt: new Date(),
        });

        if (i > 0) {
          dependencies.set(subtaskId, ['subtask-' + (i - chunkSize)]);
        }
      }
    }

    return { subtasks, dependencies };
  }

  getExecutionPlan(): TaskExecutionPlan[] {
    const plan: TaskExecutionPlan[] = [];
    const visited = new Set<string>();
    const levels = new Map<string, number>();

    const computeLevel = (taskId: string): number => {
      if (levels.has(taskId)) return levels.get(taskId)!;
      
      const deps = this.dependencyGraph.get(taskId) || [];
      if (deps.length === 0) {
        levels.set(taskId, 0);
        return 0;
      }

      let maxLevel = 0;
      for (const depId of deps) {
        maxLevel = Math.max(maxLevel, computeLevel(depId) + 1);
      }
      levels.set(taskId, maxLevel);
      return maxLevel;
    };

    for (const [taskId] of this.tasks) {
      computeLevel(taskId);
    }

    for (const [taskId, task] of this.tasks) {
      plan.push({
        taskId,
        level: levels.get(taskId) || 0,
        canRun: this.canExecute(task),
      });
    }

    return plan.sort((a, b) => a.level - b.level);
  }

  async scheduleTasks(): Promise<void> {
    while (this.runningTasks.size < this.maxConcurrent && this.taskQueue.length > 0) {
      const task = this.taskQueue.shift();
      if (!task) break;

      if (!this.canExecute(task)) {
        this.taskQueue.unshift(task);
        break;
      }

      await this.executeTask(task);
    }
  }

  private canExecute(task: Task): boolean {
    const deps = this.dependencyGraph.get(task.id) || [];
    for (const depId of deps) {
      const depTask = this.tasks.get(depId);
      if (!depTask) {
        return false;
      }
      if (depTask.status !== 'completed') {
        return false;
      }
    }
    return true;
  }

  getBlockedTasks(): Task[] {
    const blocked: Task[] = [];
    for (const task of this.taskQueue) {
      if (!this.canExecute(task)) {
        blocked.push(task);
      }
    }
    return blocked;
  }

  getDependentTasks(taskId: string): Task[] {
    const dependents: Task[] = [];
    const waiting = this.taskWaiters.get(taskId);
    if (waiting) {
      for (const dependentId of waiting) {
        const task = this.tasks.get(dependentId);
        if (task) dependents.push(task);
      }
    }
    return dependents;
  }

  private async executeTask(task: Task): Promise<void> {
    const agents = this.agentManager.getAvailableAgents(task.requiredCapabilities);
    
    if (agents.length === 0) {
      if (task.retryCount < task.maxRetries) {
        task.retryCount++;
        task.status = 'pending';
        setTimeout(() => this.addToQueue(task), this.retryDelay);
      } else {
        await this.failTask(task.id, 'No available agents');
      }
      return;
    }

    const agent = this.selectBestAgent(agents, task);
    task.status = 'running';
    task.startedAt = new Date();
    this.runningTasks.set(task.id, task);
    
    await this.agentManager.assignTask(agent.id, task);
    this.emit('task:started', { task, agentId: agent.id });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Task timeout')), task.timeout || 300000);
    });

    try {
      const executor = this.agentManager.getExecutor(agent.id);
      if (executor) {
        const result = await Promise.race([
          executor.execute(task),
          timeoutPromise
        ]);
        await this.completeTask(task.id, result as Record<string, unknown>);
      } else {
        await this.failTask(task.id, 'No executor found for agent');
      }
    } catch (error: any) {
      if (error.message === 'Task timeout') {
        await this.failTask(task.id, 'Task execution timeout');
      } else {
        await this.failTask(task.id, error.message);
      }
    }
  }

  private selectBestAgent(agents: Agent[], task: Task): Agent {
    const scored = agents.map(agent => {
      let score = 100;
      if (agent.status === 'idle') score += 50;
      score -= (agent.currentTasks || 0) * 10;
      const hasAllCaps = task.requiredCapabilities.every(cap => 
        agent.capabilities?.some(ac => ac.name === cap)
      );
      if (hasAllCaps) score += 20;
      return { agent, score };
    });
    
    scored.sort((a, b) => b.score - a.score);
    return scored[0].agent;
  }

  async completeTask(taskId: string, result: Record<string, unknown>): Promise<void> {
    const task = this.runningTasks.get(taskId);
    if (!task) return;

    task.status = 'completed';
    task.output = result;
    task.completedAt = new Date();
    this.runningTasks.delete(taskId);
    this.completedTasks.set(taskId, task);

    if (task.assignedAgentId) {
      await this.agentManager.completeTask(task.assignedAgentId, taskId, result);
    }

    this.emit('task:completed', task);
    await this.scheduleTasks();

    this.notifyDependentTasks(taskId);
  }

  private notifyDependentTasks(completedTaskId: string): void {
    const dependentIds = this.taskWaiters.get(completedTaskId);
    if (dependentIds) {
      for (const depId of dependentIds) {
        const depTask = this.tasks.get(depId);
        if (depTask && depTask.status === 'pending' && this.canExecute(depTask)) {
          this.emit('task:dependenciesMet', depTask);
        }
      }
    }
  }

  async failTask(taskId: string, error: string): Promise<void> {
    const task = this.runningTasks.get(taskId) || this.tasks.get(taskId);
    if (!task) return;

    if (task.retryCount < task.maxRetries) {
      task.retryCount++;
      task.status = 'pending';
      this.runningTasks.delete(taskId);
      setTimeout(() => this.addToQueue(task), this.retryDelay * Math.pow(2, task.retryCount - 1));
      this.emit('task:retrying', { task, error, retryCount: task.retryCount });
    } else {
      task.status = 'failed';
      task.error = error;
      task.completedAt = new Date();
      this.runningTasks.delete(taskId);
      this.failedTasks.set(taskId, task);

      this.emit('task:failed', { task, error });

      await this.handleTaskFailure(taskId, error);
    }

    await this.scheduleTasks();
  }

  private async handleTaskFailure(taskId: string, error: string): Promise<void> {
    const dependents = this.getDependentTasks(taskId);
    
    for (const dependent of dependents) {
      if (dependent.status === 'pending') {
        const otherDeps = this.dependencyGraph.get(dependent.id) || [];
        const failedDeps = Array.from(this.failedTasks.keys());
        const hasFailedDeps = otherDeps.some(d => failedDeps.includes(d));
        
        if (hasFailedDeps) {
          await this.failTask(dependent.id, `Dependency ${taskId} failed: ${error}`);
        }
      }
    }
  }

  cancelTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task && task.status === 'pending') {
      task.status = 'cancelled';
      this.emit('task:cancelled', task);
    }
  }

  cancelDependentTasks(taskId: string): void {
    const dependents = this.getDependentTasks(taskId);
    for (const dependent of dependents) {
      this.cancelTask(dependent.id);
    }
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  getPendingTasks(): Task[] {
    return this.taskQueue;
  }

  getRunningTasks(): Task[] {
    return Array.from(this.runningTasks.values());
  }

  getCompletedTasks(): Task[] {
    return Array.from(this.completedTasks.values());
  }

  getFailedTasks(): Task[] {
    return Array.from(this.failedTasks.values());
  }

  getTaskStats(): {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
  } {
    return {
      total: this.tasks.size,
      pending: this.taskQueue.length,
      running: this.runningTasks.size,
      completed: this.completedTasks.size,
      failed: this.failedTasks.size,
    };
  }

  private addToQueue(task: Task): void {
    const priorityOrder: Record<TaskPriority, number> = { critical: 0, high: 1, normal: 2, low: 3 };
    const index = this.taskQueue.findIndex(t => {
      return priorityOrder[t.priority] < priorityOrder[task.priority];
    });
    
    if (index === -1) {
      this.taskQueue.push(task);
    } else {
      this.taskQueue.splice(index, 0, task);
    }
  }
}

export interface TaskOrchestratorEvents {
  'task:created': Task;
  'task:started': { task: Task; agentId: string };
  'task:completed': Task;
  'task:failed': { task: Task; error: string };
  'task:retrying': { task: Task; error: string; retryCount: number };
  'task:cancelled': Task;
  'task:dependenciesMet': Task;
}
