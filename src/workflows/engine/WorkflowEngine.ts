import { Workflow, WorkflowNode, WorkflowNodeType, Task, WorkflowExecution } from '../../core/types';
import { TaskOrchestrator } from '../../tasks/scheduler/TaskOrchestrator';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as yaml from 'yaml';

export interface HumanApproval {
  id: string;
  workflowExecutionId: string;
  nodeId: string;
  status: 'pending' | 'approved' | 'rejected';
  requesterId: string;
  approverId?: string;
  comment?: string;
  createdAt: Date;
}

export interface WorkflowVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  defaultValue?: unknown;
  description?: string;
}

export interface LoopContext {
  index: number;
  item: unknown;
  length: number;
  first: boolean;
  last: boolean;
}

export class WorkflowEngine extends EventEmitter {
  private taskOrchestrator: TaskOrchestrator;
  private workflows: Map<string, Workflow> = new Map();
  private executions: Map<string, WorkflowExecution> = new Map();
  private humanApprovals: Map<string, HumanApproval> = new Map();
  private loopContexts: Map<string, LoopContext> = new Map();

  constructor(taskOrchestrator: TaskOrchestrator) {
    super();
    this.taskOrchestrator = taskOrchestrator;
  }

  async loadWorkflow(workflow: Workflow): Promise<void> {
    this.validateWorkflow(workflow);
    this.workflows.set(workflow.id, workflow);
    this.emit('workflow:loaded', workflow);
  }

  async loadFromYAML(yamlContent: string): Promise<Workflow> {
    const parsed = yaml.parse(yamlContent);
    const workflow = this.parseWorkflowDefinition(parsed);
    await this.loadWorkflow(workflow);
    return workflow;
  }

  async loadFromJSON(jsonContent: string): Promise<Workflow> {
    const parsed = JSON.parse(jsonContent);
    const workflow = this.parseWorkflowDefinition(parsed);
    await this.loadWorkflow(workflow);
    return workflow;
  }

  private parseWorkflowDefinition(def: Record<string, unknown>): Workflow {
    const nodes: WorkflowNode[] = [];
    const nodeDefs = (def.nodes as Record<string, unknown>[]) || [];
    
    for (const nodeDef of nodeDefs) {
      const node: WorkflowNode = {
        id: String(nodeDef.id),
        type: (nodeDef.type as WorkflowNodeType) || 'task',
        name: nodeDef.name ? String(nodeDef.name) : undefined,
        config: (nodeDef.config as Record<string, unknown>) || {},
        next: Array.isArray(nodeDef.next) ? nodeDef.next.map(String) : undefined,
        condition: nodeDef.condition ? String(nodeDef.condition) : undefined,
        branches: nodeDef.branches ? nodeDef.branches as Record<string, string> : undefined,
        maxIterations: nodeDef.maxIterations ? Number(nodeDef.maxIterations) : undefined,
        humanApproval: nodeDef.humanApproval ? Boolean(nodeDef.humanApproval) : undefined,
        approvalMessage: nodeDef.approvalMessage ? String(nodeDef.approvalMessage) : undefined,
      };
      nodes.push(node);
    }

    return {
      id: String(def.id),
      name: String(def.name),
      description: def.description ? String(def.description) : undefined,
      nodes,
      startNode: String(def.start),
      variables: (def.variables as Record<string, unknown>) || {},
    };
  }

  private validateWorkflow(workflow: Workflow): void {
    const nodeIds = new Set(workflow.nodes.map((n: WorkflowNode) => n.id));
    
    if (!nodeIds.has(workflow.startNode)) {
      throw new Error(`Start node ${workflow.startNode} not found`);
    }

    for (const node of workflow.nodes) {
      if (node.next) {
        for (const nextId of node.next) {
          if (!nodeIds.has(nextId)) {
            throw new Error(`Node ${node.id} references non-existent node ${nextId}`);
          }
        }
      }
      if (node.branches) {
        for (const branchId of Object.values(node.branches)) {
          if (!nodeIds.has(branchId)) {
            throw new Error(`Node ${node.id} references non-existent branch node ${branchId}`);
          }
        }
      }
    }
  }

  async execute(workflowId: string, input?: Record<string, unknown>): Promise<WorkflowExecution> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

    const execution: WorkflowExecution = {
      id: uuidv4(),
      workflowId,
      status: 'running',
      currentNode: workflow.startNode,
      variables: { ...workflow.variables, ...input },
      results: new Map(),
      createdAt: new Date(),
    };

    this.executions.set(execution.id, execution);
    this.emit('execution:started', execution);

    await this.executeNode(execution);

    return execution;
  }

  async pause(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (execution && execution.status === 'running') {
      execution.status = 'paused';
      this.emit('execution:paused', execution);
    }
  }

  async resume(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (execution && execution.status === 'paused') {
      execution.status = 'running';
      this.emit('execution:resumed', execution);
      await this.executeNode(execution);
    }
  }

  async cancel(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (execution) {
      execution.status = 'failed';
      execution.error = 'Cancelled by user';
      execution.completedAt = new Date();
      this.emit('execution:cancelled', execution);
    }
  }

  private async executeNode(execution: WorkflowExecution): Promise<void> {
    const workflow = this.workflows.get(execution.workflowId);
    if (!workflow || execution.status !== 'running') return;

    const currentNodeId = execution.currentNode;
    if (!currentNodeId) {
      await this.completeExecution(execution);
      return;
    }

    const node = workflow.nodes.find((n: WorkflowNode) => n.id === currentNodeId);
    if (!node) {
      execution.status = 'failed';
      execution.error = `Node ${currentNodeId} not found`;
      this.emit('execution:failed', execution);
      return;
    }

    try {
      switch (node.type) {
        case 'task':
          await this.executeTaskNode(execution, node);
          break;
        case 'condition':
          await this.executeConditionNode(execution, node);
          break;
        case 'switch':
          await this.executeSwitchNode(execution, node);
          break;
        case 'loop':
          await this.executeLoopNode(execution, node);
          break;
        case 'parallel':
          await this.executeParallelNode(execution, node);
          break;
        case 'human':
          await this.executeHumanNode(execution, node);
          break;
        default:
          await this.moveToNextNode(execution, node);
      }
    } catch (error) {
      execution.status = 'failed';
      execution.error = (error as Error).message;
      this.emit('execution:failed', execution);
    }
  }

  private async executeTaskNode(execution: WorkflowExecution, node: WorkflowNode): Promise<void> {
    const config = node.config as { 
      taskName?: string; 
      capabilities?: string[]; 
      inputMapping?: Record<string, string>;
      timeout?: number;
    };
    const input = this.mapVariables(execution.variables, config.inputMapping || {});

    const task = await this.taskOrchestrator.createTask({
      name: config.taskName || node.name || node.id,
      description: `Workflow task: ${node.id}`,
      requiredCapabilities: config.capabilities || [],
      input,
      priority: 'normal',
      timeout: config.timeout,
    });

    await this.waitForTaskComplete(execution, task, node);
    await this.moveToNextNode(execution, node);
  }

  private waitForTaskComplete(execution: WorkflowExecution, task: Task, node: WorkflowNode): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.taskOrchestrator.removeListener('task:completed', onComplete);
        this.taskOrchestrator.removeListener('task:failed', onFailed);
        reject(new Error(`Task ${task.id} timeout`));
      }, (task.timeout || 300000));

      const onComplete = (completedTask: Task) => {
        if (completedTask.id === task.id) {
          clearTimeout(timeout);
          execution.results.set(node.id, completedTask.output);
          execution.variables[`${node.id}.output`] = completedTask.output;
          this.taskOrchestrator.removeListener('task:completed', onComplete);
          this.taskOrchestrator.removeListener('task:failed', onFailed);
          resolve();
        }
      };

      const onFailed = (failedTask: Task) => {
        if (failedTask.id === task.id) {
          clearTimeout(timeout);
          this.taskOrchestrator.removeListener('task:completed', onComplete);
          this.taskOrchestrator.removeListener('task:failed', onFailed);
          reject(new Error(`Task failed: ${failedTask.error}`));
        }
      };

      this.taskOrchestrator.on('task:completed', onComplete);
      this.taskOrchestrator.on('task:failed', onFailed);
    });
  }

  private async executeConditionNode(execution: WorkflowExecution, node: WorkflowNode): Promise<void> {
    const condition = node.condition as string;
    const result = this.evaluateCondition(condition, execution.variables);
    
    execution.results.set(node.id, result);
    execution.variables[`${node.id}.result`] = result;

    const nextNodeId = result ? node.next?.[0] : node.next?.[1];
    if (nextNodeId) {
      execution.currentNode = nextNodeId;
      await this.executeNode(execution);
    } else {
      await this.completeExecution(execution);
    }
  }

  private async executeSwitchNode(execution: WorkflowExecution, node: WorkflowNode): Promise<void> {
    const config = node.config as { 
      expression: string;
      default?: string;
    };
    
    const value = this.evaluateExpression(config.expression, execution.variables);
    execution.variables[`${node.id}.value`] = value;

    const branches = node.branches || {};
    let nextNodeId: string | undefined;

    for (const [caseValue, targetNodeId] of Object.entries(branches)) {
      if (String(caseValue) === String(value)) {
        nextNodeId = targetNodeId;
        break;
      }
    }

    if (!nextNodeId && config.default) {
      nextNodeId = config.default;
    }

    if (nextNodeId) {
      execution.currentNode = nextNodeId;
      await this.executeNode(execution);
    } else {
      await this.completeExecution(execution);
    }
  }

  private async executeLoopNode(execution: WorkflowExecution, node: WorkflowNode): Promise<void> {
    const config = node.config as { 
      iterations?: number;
      variable?: string;
      items?: unknown[];
      while?: string;
      until?: string;
    };
    
    const maxIterations = node.maxIterations || config.iterations || 10;
    const loopVar = config.variable || 'item';
    const currentIteration = (execution.variables['loop.iteration'] as number) || 0;

    let shouldContinue = true;

    if (config.while) {
      shouldContinue = this.evaluateCondition(config.while, execution.variables);
    } else if (config.until) {
      shouldContinue = !this.evaluateCondition(config.until, execution.variables);
    } else {
      const items = config.items || Array.from({ length: maxIterations }, (_, i) => i);
      shouldContinue = currentIteration < items.length;
    }

    if (!shouldContinue || currentIteration >= maxIterations) {
      execution.variables['loop.iteration'] = 0;
      if (node.next && node.next[1]) {
        execution.currentNode = node.next[1];
        await this.executeNode(execution);
      } else {
        await this.completeExecution(execution);
      }
      return;
    }

    const items = config.items || Array.from({ length: maxIterations }, (_, i) => i);
    const item = items[currentIteration];

    execution.variables[loopVar] = item;
    execution.variables['loop.index'] = currentIteration;
    execution.variables['loop.first'] = currentIteration === 0;
    execution.variables['loop.last'] = currentIteration === items.length - 1;
    execution.variables['loop.iteration'] = currentIteration + 1;

    if (node.next && node.next[0]) {
      execution.currentNode = node.next[0];
      await this.executeNode(execution);
    }
  }

  private async executeParallelNode(execution: WorkflowExecution, node: WorkflowNode): Promise<void> {
    const config = node.config as { 
      branches: string[];
      waitAll?: boolean;
    };
    
    if (!node.next || node.next.length < 2) return;

    const branchPromises = node.next.slice(0, config.branches?.length || node.next.length - 1).map(async (branchId, index) => {
      const branchExecution = { ...execution };
      branchExecution.currentNode = branchId;
      await this.executeNode(branchExecution);
    });

    await Promise.all(branchPromises);

    execution.currentNode = node.next[node.next.length - 1];
    await this.executeNode(execution);
  }

  private async executeHumanNode(execution: WorkflowExecution, node: WorkflowNode): Promise<void> {
    const config = node.config as { 
      approverId?: string;
      message?: string;
      approvalMessage?: string;
    };
    
    const approval: HumanApproval = {
      id: uuidv4(),
      workflowExecutionId: execution.id,
      nodeId: node.id,
      status: 'pending',
      requesterId: 'system',
      approverId: config.approverId,
      createdAt: new Date(),
    };

    this.humanApprovals.set(approval.id, approval);
    execution.status = 'waiting_approval';
    
    this.emit('humanApproval:required', {
      ...approval,
      message: config.message || config.approvalMessage || 'Approval required',
    });
  }

  async approveHumanTask(approvalId: string, approverId: string, approved: boolean, comment?: string): Promise<void> {
    const approval = this.humanApprovals.get(approvalId);
    if (!approval) throw new Error(`Approval ${approvalId} not found`);

    approval.status = approved ? 'approved' : 'rejected';
    approval.approverId = approverId;
    approval.comment = comment;

    const execution = this.executions.get(approval.workflowExecutionId);
    if (execution) {
      execution.status = 'running';
      const workflow = this.workflows.get(execution.workflowId);
      const node = workflow?.nodes.find(n => n.id === approval.nodeId);
      
      const nextNodeId = approved 
        ? (node?.next?.[0] || node?.branches?.['approved'])
        : (node?.next?.[1] || node?.branches?.['rejected']);
      
      if (nextNodeId) {
        execution.currentNode = nextNodeId;
        await this.executeNode(execution);
      } else {
        await this.completeExecution(execution);
      }
    }

    this.emit('humanApproval:processed', approval);
  }

  getPendingApprovals(approverId?: string): HumanApproval[] {
    const all = Array.from(this.humanApprovals.values());
    if (approverId) {
      return all.filter(a => a.approverId === approverId && a.status === 'pending');
    }
    return all.filter(a => a.status === 'pending');
  }

  private async completeExecution(execution: WorkflowExecution): Promise<void> {
    execution.status = 'completed';
    execution.completedAt = new Date();
    this.emit('execution:completed', execution);
  }

  private evaluateCondition(condition: string, variables: Record<string, unknown>): boolean {
    try {
      const keys = Object.keys(variables);
      const values = Object.values(variables);
      const fn = new Function(...keys, `return ${condition}`);
      return fn(...values);
    } catch {
      return false;
    }
  }

  private evaluateExpression(expression: string, variables: Record<string, unknown>): unknown {
    try {
      const keys = Object.keys(variables);
      const values = Object.values(variables);
      const fn = new Function(...keys, `return ${expression}`);
      return fn(...values);
    } catch {
      return undefined;
    }
  }

  private mapVariables(variables: Record<string, unknown>, mapping: Record<string, string>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(mapping)) {
      result[key] = variables[value] ?? value;
    }
    return result;
  }

  private async moveToNextNode(execution: WorkflowExecution, node: WorkflowNode): Promise<void> {
    if (node.next && node.next.length > 0) {
      execution.currentNode = node.next[0];
      await this.executeNode(execution);
    } else {
      await this.completeExecution(execution);
    }
  }

  getWorkflow(workflowId: string): Workflow | undefined {
    return this.workflows.get(workflowId);
  }

  getExecution(executionId: string): WorkflowExecution | undefined {
    return this.executions.get(executionId);
  }

  getAllExecutions(): WorkflowExecution[] {
    return Array.from(this.executions.values());
  }

  getAllWorkflows(): Workflow[] {
    return Array.from(this.workflows.values());
  }

  deleteWorkflow(workflowId: string): void {
    this.workflows.delete(workflowId);
  }

  getExecutionStats(): {
    total: number;
    running: number;
    completed: number;
    failed: number;
    paused: number;
    waitingApproval: number;
  } {
    const executions = Array.from(this.executions.values());
    return {
      total: executions.length,
      running: executions.filter(e => e.status === 'running').length,
      completed: executions.filter(e => e.status === 'completed').length,
      failed: executions.filter(e => e.status === 'failed').length,
      paused: executions.filter(e => e.status === 'paused').length,
      waitingApproval: executions.filter(e => e.status === 'waiting_approval').length,
    };
  }
}

declare module '../../tasks/scheduler/TaskOrchestrator' {
  interface TaskOrchestrator {
    on(event: 'task:completed', listener: (task: Task) => void): this;
    on(event: 'task:failed', listener: (task: Task) => void): this;
    removeListener(event: 'task:completed', listener: (task: Task) => void): this;
    removeListener(event: 'task:failed', listener: (task: Task) => void): this;
  }
}
