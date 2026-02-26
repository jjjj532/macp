import dotenv from 'dotenv';
dotenv.config();
import { AgentRegistry } from './core/registry/AgentRegistry';
import { AgentManager } from './core/manager/AgentManager';
import { TaskOrchestrator } from './tasks/scheduler/TaskOrchestrator';
import { MessageBus } from './messages/pubSub/MessageBus';
import { KnowledgeBase, InMemoryVectorStore, InMemoryGraphStore } from './knowledge/base/KnowledgeBase';
import { WorkflowEngine } from './workflows/engine/WorkflowEngine';
import { MetricsCollector, LogAggregator, AlertManager } from './monitoring/core/Monitoring';
import { APIServer } from './api/server';
import { Capability, Task } from './core/types';
import { EventEmitter } from 'events';
import { OpenClawIntegration } from './integrations/OpenClaw';

class MACP {
  private agentRegistry: AgentRegistry;
  private agentManager: AgentManager;
  private taskOrchestrator: TaskOrchestrator;
  private messageBus: MessageBus;
  private knowledgeBase: KnowledgeBase;
  private workflowEngine: WorkflowEngine;
  private metrics: MetricsCollector;
  private logs: LogAggregator;
  private alerts: AlertManager;
  private apiServer: APIServer;
  private openClaw: OpenClawIntegration | null = null;

  constructor() {
    this.logs = new LogAggregator();
    this.metrics = new MetricsCollector();
    this.alerts = new AlertManager();
    
    this.agentRegistry = new AgentRegistry();
    this.agentManager = new AgentManager(this.agentRegistry);
    this.taskOrchestrator = new TaskOrchestrator(this.agentManager);
    this.messageBus = new MessageBus();
    
    const vectorStore = new InMemoryVectorStore();
    const graphStore = new InMemoryGraphStore();
    this.knowledgeBase = new KnowledgeBase(vectorStore, graphStore);
    
    this.workflowEngine = new WorkflowEngine(this.taskOrchestrator);
    
    this.apiServer = new APIServer(
      this.agentRegistry,
      this.agentManager,
      this.taskOrchestrator,
      this.messageBus,
      this.knowledgeBase,
      this.workflowEngine,
      this.metrics,
      this.logs,
      this.alerts,
      3000
    );

    this.setupEventHandlers();
    this.registerAlertRules();
    this.registerDefaultAgents();
    this.initOpenClaw();
    
    setInterval(() => {
      (this.taskOrchestrator as any).scheduleTasks();
    }, 2000);
  }

  private initOpenClaw(): void {
    const openClawUrl = process.env.OPENCLAW_URL || 'http://localhost:18789';
    const apiKey = process.env.OPENCLAW_API_KEY || '';
    
    this.openClaw = new OpenClawIntegration({
      baseUrl: openClawUrl,
      apiKey: apiKey || undefined,
    });

    console.log('Checking OpenClaw connection...');
    
    this.openClaw.checkHealth().then((healthy) => {
      if (healthy) {
        console.log('\n✓ OpenClaw connected: ' + openClawUrl);
        this.registerOpenClawAgent();
      } else {
        console.log('\n⚠ OpenClaw not available: ' + openClawUrl);
      }
    }).catch((err) => {
      console.log('\n✗ OpenClaw error:', err.message);
    });
  }

  private async registerOpenClawAgent(): Promise<void> {
    if (!this.openClaw) return;

    try {
      await this.agentManager.createAgent({
        id: 'openclaw-agent',
        name: 'OpenClaw Agent',
        domain: 'AI Assistant',
        description: 'Full-featured AI agent with chat, tool invocation, and session management capabilities',
        capabilities: [
          { name: 'chat', description: 'General chat with AI' },
          { name: 'invoke_tool', description: 'Directly invoke OpenClaw tools' },
          { name: 'list_sessions', description: 'List all OpenClaw sessions' },
          { name: 'session_management', description: 'Manage OpenClaw sessions' },
        ],
        executor: {
          execute: async (task) => {
            const action = task.input?.action as string || 'chat';
            const prompt = task.input?.prompt as string || '';
            const toolName = task.input?.tool as string || '';
            const toolArgs = task.input?.args as any || {};
            
            if (action === 'tool') {
              const result = await this.openClaw!.invokeTool(toolName, toolArgs);
              return { tool: toolName, args: toolArgs, result };
            } else if (action === 'list_sessions') {
              const sessions = await this.openClaw!.listSessions();
              return { sessions: sessions.slice(0, 10) };
            } else {
              const response = await this.openClaw!.sendMessage(prompt);
              return { response: response.content, toolCalls: response.toolCalls };
            }
          },
        },
      });
      
      await this.agentManager.startAgent('openclaw-agent');
      console.log('✓ OpenClaw Agent registered with full capabilities');
    } catch (error: any) {
      console.log('✗ Failed to register OpenClaw agent:', error.message);
    }
  }

  private setupEventHandlers(): void {
    this.agentRegistry.on('agent:registered', (agent) => {
      this.logs.info('Agent registered: ' + agent.name, { agentId: agent.id });
      this.metrics.incrementCounter('agents_registered_total');
    });

    this.agentManager.on('task:completed', ({ agentId, taskId }) => {
      this.logs.info('Task completed', { agentId, taskId });
      this.metrics.incrementCounter('tasks_completed_total');
    });

    (this.taskOrchestrator as EventEmitter).on('task:failed', (data: { task: Task; error: string }) => {
      this.logs.error('Task failed: ' + data.error, { taskId: data.task.id });
      this.metrics.incrementCounter('tasks_failed_total');
    });

    this.messageBus.on('message:sent', () => {
      this.metrics.incrementCounter('messages_total');
    });
  }

  private registerAlertRules(): void {
    this.alerts.registerRule({
      id: 'no_available_agents',
      name: 'No Available Agents',
      condition: () => this.agentRegistry.findAvailable([]).length === 0,
      message: 'No available agents',
      severity: 'warning',
    });

    setInterval(() => this.alerts.checkRules(), 10000);
  }

  private async registerDefaultAgents(): Promise<void> {
    const coderAgent: Capability[] = [
      { name: 'code_generation', description: 'Generate code' },
      { name: 'code_review', description: 'Review code' },
    ];

    await this.agentManager.createAgent({
      id: 'agent-coder-001',
      name: 'Code Agent',
      domain: 'Software Development',
      description: 'Code generation and refactoring',
      capabilities: coderAgent,
      executor: {
        execute: async (task) => {
          this.logs.info('Executing: ' + task.name);
          await new Promise(r => setTimeout(r, 1000));
          return { output: 'Code generated' };
        },
      },
    });

    await this.agentManager.startAgent('agent-coder-001');

    await this.registerProfitAgents();
    
    this.logs.info('Default agents ready');
  }

  private async registerProfitAgents(): Promise<void> {
    const contentAgent: Capability[] = [
      { name: 'article_generation', description: 'Generate articles' },
      { name: 'seo_optimization', description: 'SEO optimization' },
      { name: 'content_publishing', description: 'Publish to platforms' },
    ];

    await this.agentManager.createAgent({
      id: 'content-agent',
      name: 'Content Agent',
      domain: 'Content Creation',
      description: 'Auto-generate content and publish for ad revenue',
      capabilities: contentAgent,
      executor: {
        execute: async (task) => {
          this.logs.info('Content task: ' + task.name);
          return { output: 'Content generated and published' };
        },
      },
    });
    await this.agentManager.startAgent('content-agent');

    const ecommerceAgent: Capability[] = [
      { name: 'product_research', description: 'Research products' },
      { name: 'listing_creation', description: 'Create product listings' },
      { name: 'customer_service', description: 'Handle customer inquiries' },
    ];

    await this.agentManager.createAgent({
      id: 'ecommerce-agent',
      name: 'Ecommerce Agent',
      domain: 'Ecommerce',
      description: 'Auto-manage ecommerce store for sales revenue',
      capabilities: ecommerceAgent,
      executor: {
        execute: async (task) => {
          this.logs.info('Ecommerce task: ' + task.name);
          return { output: 'Ecommerce task completed' };
        },
      },
    });
    await this.agentManager.startAgent('ecommerce-agent');

    const tradingAgent: Capability[] = [
      { name: 'market_analysis', description: 'Analyze market data' },
      { name: 'signal_generation', description: 'Generate trading signals' },
      { name: 'auto_trading', description: 'Execute trades automatically' },
    ];

    await this.agentManager.createAgent({
      id: 'trading-agent',
      name: 'Trading Agent',
      domain: 'Finance',
      description: 'Automated trading for profit',
      capabilities: tradingAgent,
      executor: {
        execute: async (task) => {
          this.logs.info('Trading task: ' + task.name);
          return { output: 'Trade executed' };
        },
      },
    });
    await this.agentManager.startAgent('trading-agent');

    const saasAgent: Capability[] = [
      { name: 'api_management', description: 'Manage API keys' },
      { name: 'usage_tracking', description: 'Track API usage' },
      { name: 'subscription_management', description: 'Manage subscriptions' },
    ];

    await this.agentManager.createAgent({
      id: 'saas-agent',
      name: 'SaaS Agent',
      domain: 'SaaS',
      description: 'Provide SaaS API services for subscription revenue',
      capabilities: saasAgent,
      executor: {
        execute: async (task) => {
          this.logs.info('SaaS task: ' + task.name);
          return { output: 'SaaS task completed' };
        },
      },
    });
    await this.agentManager.startAgent('saas-agent');

    console.log('✓ Profit agents registered: Content, Ecommerce, Trading, SaaS');
  }

  start(): void {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║          MACP + OpenClaw Integration                        ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log('║  API:     http://localhost:3000                              ║');
    console.log('║  OpenClaw: ' + (process.env.OPENCLAW_URL || 'http://localhost:18789'));
    console.log('╚══════════════════════════════════════════════════════════════╝');
  }
}

const macp = new MACP();
macp.start();
