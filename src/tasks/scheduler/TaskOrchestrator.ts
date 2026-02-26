import { Task, TaskStatus, TaskPriority, Agent } from '../../core/types';
import { AgentManager, AgentExecutor } from '../../core/manager/AgentManager';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

EventEmitter.defaultMaxListeners = 20;

export interface TaskDecompositionResult {
  subtasks: Omit<Task, 'id'>[];
  dependencies: Map<string, string[]>;
}

export interface TaskConfig {
  name: string;
  description: string;
  requiredCapabilities: string[];
  input: Record<string, unknown>;
  priority?: TaskPriority;
  maxRetries?: number;
  dependencies?: string[];
}

export class TaskOrchestrator extends EventEmitter {
  private agentManager: AgentManager;
  private tasks: Map<string, Task> = new Map();
  private taskQueue: Task[] = [];
  private runningTasks: Map<string, Task> = new Map();
  private maxConcurrent: number;
  private retryDelay: number;

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
      retryCount: 0,
      maxRetries: config.maxRetries || 3,
      createdAt: new Date(),
    };

    this.tasks.set(task.id, task);
    this.addToQueue(task);
    this.emit('task:created', task);
    
    return task;
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
    for (const depId of task.dependencies) {
      const depTask = this.tasks.get(depId);
      if (!depTask || depTask.status !== 'completed') {
        return false;
      }
    }
    return true;
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

    try {
      const executor = this.agentManager.getExecutor(agent.id);
      if (executor) {
        const result = await executor.execute(task);
        await this.completeTask(task.id, result);
      } else {
        await this.failTask(task.id, 'No executor found for agent');
      }
    } catch (error: any) {
      await this.failTask(task.id, error.message);
    }
  }

  private selectBestAgent(agents: Agent[], task: Task): Agent {
    return agents[0];
  }

  async completeTask(taskId: string, result: Record<string, unknown>): Promise<void> {
    const task = this.runningTasks.get(taskId);
    if (!task) return;

    task.status = 'completed';
    task.output = result;
    task.completedAt = new Date();
    this.runningTasks.delete(taskId);

    if (task.assignedAgentId) {
      await this.agentManager.completeTask(task.assignedAgentId, taskId, result);
    }

    this.emit('task:completed', task);
    await this.scheduleTasks();
  }

  async failTask(taskId: string, error: string): Promise<void> {
    const task = this.runningTasks.get(taskId) || this.tasks.get(taskId);
    if (!task) return;

    if (task.retryCount < task.maxRetries) {
      task.retryCount++;
      task.status = 'pending';
      this.runningTasks.delete(taskId);
      setTimeout(() => this.addToQueue(task), this.retryDelay * task.retryCount);
      this.emit('task:retrying', { task, error });
    } else {
      task.status = 'failed';
      task.error = error;
      task.completedAt = new Date();
      this.runningTasks.delete(taskId);

      if (task.assignedAgentId) {
        await this.agentManager.failTask(task.assignedAgentId, taskId, error);
      }

      this.emit('task:failed', { task, error });
    }

    await this.scheduleTasks();
  }

  cancelTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (task && task.status === 'pending') {
      task.status = 'cancelled';
      this.emit('task:cancelled', task);
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
  'task:retrying': { task: Task; error: string };
  'task:cancelled': Task;
}
