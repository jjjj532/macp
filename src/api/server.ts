import cors from 'cors';
import express, { Request, Response, NextFunction } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { AgentRegistry } from '../core/registry/AgentRegistry';
import { AgentManager } from '../core/manager/AgentManager';
import { TaskOrchestrator } from '../tasks/scheduler/TaskOrchestrator';
import { MessageBus } from '../messages/pubSub/MessageBus';
import { KnowledgeBase } from '../knowledge/base/KnowledgeBase';
import { WorkflowEngine } from '../workflows/engine/WorkflowEngine';
import { MetricsCollector, LogAggregator, AlertManager } from '../monitoring/core/Monitoring';
import { Capability, Task, Workflow } from '../core/types';

export class APIServer {
  private app = express();
  private server: Server;
  private wss: WebSocketServer;
  
  constructor(
    private agentRegistry: AgentRegistry,
    private agentManager: AgentManager,
    private taskOrchestrator: TaskOrchestrator,
    private messageBus: MessageBus,
    private knowledgeBase: KnowledgeBase,
    private workflowEngine: WorkflowEngine,
    private metrics: MetricsCollector,
    private logs: LogAggregator,
    private alerts: AlertManager,
    port: number = 3000
  ) {
    this.server = require('http').createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupProfitRoutes();
    
    this.server.listen(port, () => {
      console.log(`API Server running on port ${port}`);
    });
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        this.metrics.incrementCounter('http_requests_total', { method: req.method, path: req.path, status: res.statusCode.toString() });
        this.metrics.recordHistogram('http_request_duration_ms', duration, { method: req.method, path: req.path });
      });
      next();
    });
  }

  private setupRoutes(): void {
    this.app.get('/health', (req, res) => res.json({ status: 'ok' }));

    this.app.get('/api/agents', (req, res) => {
      res.json(this.agentManager.getAllAgents());
    });

    this.app.post('/api/agents', async (req, res) => {
      try {
        const { id, name, domain, description, capabilities, executor } = req.body;
        
        const agent = await this.agentManager.createAgent({
          id,
          name,
          domain,
          description,
          capabilities: capabilities as Capability[],
          executor: {
            execute: async (task) => ({ result: 'executed' }),
            ...executor,
          },
        });
        
        await this.agentManager.startAgent(id);
        res.status(201).json(agent);
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });

    this.app.get('/api/agents/:id', (req, res) => {
      const agent = this.agentManager.getAgent(req.params.id);
      if (!agent) return res.status(404).json({ error: 'Agent not found' });
      res.json(agent);
    });

    this.app.post('/api/agents/:id/start', async (req, res) => {
      try {
        await this.agentManager.startAgent(req.params.id);
        res.json({ status: 'started' });
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });

    this.app.post('/api/agents/:id/stop', async (req, res) => {
      try {
        await this.agentManager.stopAgent(req.params.id);
        res.json({ status: 'stopped' });
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });

    this.app.get('/api/agents/capabilities/:capability', (req, res) => {
      const agents = this.agentRegistry.findByCapability(req.params.capability);
      res.json(agents);
    });

    this.app.get('/api/tasks', (req, res) => {
      res.json(this.taskOrchestrator.getAllTasks());
    });

    this.app.post('/api/tasks', async (req, res) => {
      try {
        const task = await this.taskOrchestrator.createTask(req.body);
        this.metrics.incrementCounter('tasks_created_total');
        res.status(201).json(task);
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });

    this.app.get('/api/tasks/:id', (req, res) => {
      const task = this.taskOrchestrator.getTask(req.params.id);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      res.json(task);
    });

    this.app.delete('/api/tasks/:id', (req, res) => {
      this.taskOrchestrator.cancelTask(req.params.id);
      res.json({ status: 'cancelled' });
    });

    this.app.post('/api/messages', async (req, res) => {
      try {
        const { senderId, receiverId, payload, persistent } = req.body;
        const message = await this.messageBus.send(senderId, receiverId, payload, persistent);
        this.metrics.incrementCounter('messages_sent_total');
        res.status(201).json(message);
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });

    this.app.get('/api/messages', (req, res) => {
      const { agentId, topic, limit } = req.query;
      const messages = this.messageBus.getMessages({ senderId: agentId as string, topic: topic as string }, Number(limit) || 100);
      res.json(messages);
    });

    this.app.post('/api/knowledge', async (req, res) => {
      try {
        const entry = await this.knowledgeBase.add(req.body);
        this.metrics.incrementCounter('knowledge_entries_total');
        res.status(201).json(entry);
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });

    this.app.get('/api/knowledge/search', async (req, res) => {
      try {
        const { q, limit } = req.query;
        const results = await this.knowledgeBase.search(q as string, Number(limit) || 10);
        res.json(results);
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });

    this.app.get('/api/knowledge/:id', async (req, res) => {
      const entry = await this.knowledgeBase.searchById(req.params.id);
      if (!entry) return res.status(404).json({ error: 'Entry not found' });
      res.json(entry);
    });

    this.app.get('/api/workflows', (req, res) => {
      const workflows = this.workflowEngine.getAllWorkflows();
      res.json(workflows);
    });

    this.app.post('/api/workflows', async (req, res) => {
      try {
        if (req.body.yaml) {
          const workflow = await this.workflowEngine.loadFromYAML(req.body.yaml);
          res.status(201).json(workflow);
        } else {
          await this.workflowEngine.loadWorkflow(req.body as Workflow);
          res.status(201).json(req.body);
        }
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });

    this.app.post('/api/workflows/:id/execute', async (req, res) => {
      try {
        const execution = await this.workflowEngine.execute(req.params.id, req.body.input);
        res.status(201).json(execution);
      } catch (error) {
        res.status(400).json({ error: (error as Error).message });
      }
    });

    this.app.get('/api/metrics', (req, res) => {
      const { name } = req.query;
      res.json(this.metrics.getAllMetrics(name as string));
    });

    this.app.get('/api/logs', (req, res) => {
      const { level, limit } = req.query;
      res.json(this.logs.query({ level: level as any, limit: Number(limit) || 100 }));
    });

    this.app.get('/api/alerts', (req, res) => {
      res.json(this.alerts.getAlerts(true));
    });

    this.app.get('/api/stats', (req, res) => {
      res.json({
        agents: this.agentManager.getAllAgents().length,
        tasks: this.taskOrchestrator.getTaskStats(),
        metrics: this.metrics.getMetricNames(),
      });
    });
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws) => {
      ws.on('message', (message) => {
        this.handleWebSocketMessage(ws, message.toString());
      });

      ws.send(JSON.stringify({ type: 'connected', message: 'MACP WebSocket' }));
    });
  }

  private handleWebSocketMessage(ws: WebSocket, message: string): void {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'task_update':
          this.broadcast({ type: 'task_update', data: this.taskOrchestrator.getAllTasks() });
          break;
        case 'agent_update':
          this.broadcast({ type: 'agent_update', data: this.agentManager.getAllAgents() });
          break;
      }
    } catch (e) {
      console.error('WebSocket message error:', e);
    }
  }

  private broadcast(data: unknown): void {
    const message = JSON.stringify(data);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  private setupProfitRoutes(): void {
    const { ProfitAPI } = require('./profit');
    const profitAPI = new ProfitAPI();
    this.app.use('/api', profitAPI.getRouter());
  }
}
