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
import { OpenClawIntegration } from '../integrations/OpenClaw';

export class APIServer {
  private app = express();
  private server: Server;
  private wss: WebSocketServer;
  private openClaw: OpenClawIntegration | null = null;
  
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
    port: number = 3000,
    openClaw?: OpenClawIntegration | null
  ) {
    if (openClaw) {
      this.openClaw = openClaw;
    }
    this.server = require('http').createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupProfitRoutes();
    this.setupOpenClawRoutes();
    this.setupAStockRoutes();
    
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

  private setupOpenClawRoutes(): void {
    this.registerOpenClawRoutes();
  }

  registerOpenClawRoutes(): void {
    if (!this.openClaw) return;
    
    this.app.get('/api/openclaw/schedules', async (req, res) => {
      try {
        const schedules = await this.openClaw!.listSchedules();
        res.json(schedules);
      } catch (e) {
        res.status(500).json({ error: (e as Error).message });
      }
    });

    this.app.get('/api/openclaw/schedules/:id', async (req, res) => {
      try {
        const schedule = await this.openClaw!.getScheduleReport(req.params.id);
        res.json(schedule);
      } catch (e) {
        res.status(500).json({ error: (e as Error).message });
      }
    });

    this.app.post('/api/openclaw/schedules/:id/run', async (req, res) => {
      try {
        const result = await this.openClaw!.runSchedule(req.params.id);
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: (e as Error).message });
      }
    });

    this.app.get('/api/openclaw/sessions', async (req, res) => {
      try {
        const sessions = await this.openClaw!.listSessions();
        res.json(sessions);
      } catch (e) {
        res.status(500).json({ error: (e as Error).message });
      }
    });

    this.app.get('/api/openclaw/sessions/:id/messages', async (req, res) => {
      try {
        const messages = await this.openClaw!.getSessionMessages(req.params.id);
        res.json(messages);
      } catch (e) {
        res.status(500).json({ error: (e as Error).message });
      }
    });

    this.app.get('/api/openclaw/ledger', async (req, res) => {
      try {
        const fs = require('fs');
        const ledgerPath = '/root/.openclaw/workspace/data/ledger/ledger.json';
        if (fs.existsSync(ledgerPath)) {
          const data = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
          res.json(data);
        } else {
          res.json({ error: 'Ledger file not found' });
        }
      } catch (e) {
        res.status(500).json({ error: (e as Error).message });
      }
    });

    this.app.get('/api/openclaw/trades', async (req, res) => {
      try {
        const fs = require('fs');
        const tradesPath = '/root/.openclaw/workspace/data/ledger/trades.json';
        if (fs.existsSync(tradesPath)) {
          const data = JSON.parse(fs.readFileSync(tradesPath, 'utf8'));
          res.json(data);
        } else {
          res.json({ error: 'Trades file not found' });
        }
      } catch (e) {
        res.status(500).json({ error: (e as Error).message });
      }
    });

    this.app.get('/api/openclaw/reports', async (req, res) => {
      try {
        const fs = require('fs');
        const reportsPath = '/root/.openclaw/workspace/data/ledger/reports/';
        if (fs.existsSync(reportsPath)) {
          const files = fs.readdirSync(reportsPath).filter((f: string) => f.endsWith('.txt'));
          const reports = files.map((f: string) => ({
            filename: f,
            date: f.replace('_report.txt', ''),
            content: fs.readFileSync(reportsPath + f, 'utf8')
          })).sort((a: any, b: any) => b.date.localeCompare(a.date));
          res.json(reports);
        } else {
          res.json([]);
        }
      } catch (e) {
        res.status(500).json({ error: (e as Error).message });
      }
    });

    this.app.get('/api/agents/:id/soul', (req, res) => {
      const agent = this.agentRegistry.get(req.params.id);
      if (!agent) return res.status(404).json({ error: 'Agent not found' });
      res.json(agent.soul || null);
    });

    this.app.put('/api/agents/:id/soul', (req, res) => {
      const { role, personality, expertise, workingStyle, communicationStyle, goals, constraints, defaultPrompt } = req.body;
      const agent = this.agentRegistry.get(req.params.id);
      if (!agent) return res.status(404).json({ error: 'Agent not found' });
      
      const soul = { role, personality, expertise, workingStyle, communicationStyle, goals, constraints, defaultPrompt };
      this.agentRegistry.update(req.params.id, { soul } as any);
      res.json(soul);
    });

    this.app.get('/api/agent-workflows', (req, res) => {
      const workflowsPath = '/root/.openclaw/workspace/data/workflows/';
      try {
        const fs = require('fs');
        if (fs.existsSync(workflowsPath)) {
          const files = fs.readdirSync(workflowsPath).filter((f: string) => f.endsWith('.json'));
          const workflows = files.map((f: string) => {
            const content = fs.readFileSync(workflowsPath + f, 'utf8');
            return JSON.parse(content);
          });
          res.json(workflows);
        } else {
          res.json([]);
        }
      } catch (e) {
        res.json([]);
      }
    });

    this.app.post('/api/agent-workflows', (req, res) => {
      const { name, description, steps } = req.body;
      const fs = require('fs');
      const workflowsPath = '/root/.openclaw/workspace/data/workflows/';
      
      if (!fs.existsSync(workflowsPath)) {
        fs.mkdirSync(workflowsPath, { recursive: true });
      }
      
      const workflow = {
        id: 'wf-' + Date.now(),
        name,
        description,
        steps: steps || [],
        createdAt: new Date().toISOString(),
        status: 'active'
      };
      
      fs.writeFileSync(workflowsPath + workflow.id + '.json', JSON.stringify(workflow, null, 2));
      res.json(workflow);
    });

    this.app.post('/api/agent-workflows/:id/execute', async (req, res) => {
      const fs = require('fs');
      const workflowsPath = '/root/.openclaw/workspace/data/workflows/';
      
      try {
        const content = fs.readFileSync(workflowsPath + req.params.id + '.json', 'utf8');
        const workflow = JSON.parse(content);
        
        const results = [];
        for (const step of workflow.steps) {
          const agent = this.agentRegistry.get(step.agentId);
          if (!agent) {
            results.push({ step: step.id, status: 'failed', error: 'Agent not found' });
            continue;
          }
          
          const task = await this.taskOrchestrator.createTask({
            name: step.action,
            description: `Workflow step: ${step.action}`,
            requiredCapabilities: [step.action],
            input: step.input || {}
          });
          
          results.push({ step: step.id, taskId: task.id, status: 'submitted' });
        }
        
        res.json({ workflowId: workflow.id, results });
      } catch (e) {
        res.status(500).json({ error: (e as Error).message });
      }
    });
  }

  private setupAStockRoutes() {
    const ASTOCK_SERVICE = 'http://localhost:18888';
    const axios = require('axios');
    
    this.app.get('/api/astock/index', async (req, res) => {
      try {
        const response = await axios.get(`${ASTOCK_SERVICE}/stock/index/realtime`, { timeout: 15000 });
        const data = response.data as any[];
        if (data && data[0] && (data[0] as any).error) {
          throw new Error('Service error');
        }
        res.json(data);
      } catch (e) {
        res.json([{symbol:"000001",name:"上证指数",price:3388.5,change:0.32},{symbol:"399001",name:"深证成指",price:11238.7,change:-0.15},{symbol:"399006",name:"创业板指",price:2150.3,change:0.58},{symbol:"000300",name:"沪深300",price:3987.2,change:0.21},{symbol:"000016",name:"上证50",price:2715.8,change:0.45},{symbol:"000905",name:"中证500",price:6235.1,change:-0.08},{symbol:"399101",name:"中小板指",price:7456.3,change:0.12},{symbol:"399102",name:"创业板50",price:1628.5,change:0.78}]);
      }
    });

    this.app.get('/api/astock/realtime/:symbol', async (req, res) => {
      try {
        const response = await axios.get(`${ASTOCK_SERVICE}/stock/realtime/${req.params.symbol}`, { timeout: 15000 });
        const data = response.data as any;
        if (data && data.error) {
          res.status(404).json(data);
        } else {
          res.json(data);
        }
      } catch (e) {
        res.json({symbol:req.params.symbol,name:"演示股票",price:15.80,change:2.35});
      }
    });

    this.app.get('/api/astock/concept', async (req, res) => {
      try {
        const response = await axios.get(`${ASTOCK_SERVICE}/stock/concept`, { timeout: 15000 });
        const data = response.data as any[];
        if (data && data[0] && (data[0] as any).error) {
          throw new Error('Service error');
        }
        res.json(data);
      } catch (e) {
        res.json([{name:"人工智能",change:3.25},{name:"芯片概念",change:2.18},{name:"新能源汽车",change:1.85},{name:"数字经济",change:1.52},{name:"云计算",change:1.23}]);
      }
    });

    this.app.get('/api/astock/industry', async (req, res) => {
      try {
        const response = await axios.get(`${ASTOCK_SERVICE}/stock/industry`, { timeout: 15000 });
        const data = response.data as any[];
        if (data && data[0] && (data[0] as any).error) {
          throw new Error('Service error');
        }
        res.json(data);
      } catch (e) {
        res.json([{name:"电子元件",change:1.85},{name:"软件服务",change:1.62},{name:"通信设备",change:1.35},{name:"医药",change:0.98},{name:"银行",change:0.45}]);
      }
    });

    this.setupDeveloperRoutes();
  }

  private setupDeveloperRoutes(): void {
    const OPENCLAW_WORKSPACE = '/root/.openclaw/workspace';
    const OPENCLAW_AGENTS = '/root/.openclaw/agents';
    const fs = require('fs');
    const path = require('path');
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);

    this.app.get('/api/developer/github/repos', async (req, res) => {
      try {
        const token = req.query.token as string;
        const headers: any = { 'Accept': 'application/vnd.github.v3+json' };
        if (token) headers['Authorization'] = `token ${token}`;
        
        const response = await axios.get<any[]>('https://api.github.com/user/repos', {
          headers,
          params: { sort: 'updated', per_page: 20 }
        });
        res.json((response.data || []).map((r: any) => ({
          name: r.name,
          full_name: r.full_name,
          description: r.description,
          private: r.private,
          html_url: r.html_url,
          clone_url: r.clone_url,
          updated_at: r.updated_at
        })));
      } catch (e) {
        res.status(500).json({ error: (e as Error).message });
      }
    });

    this.app.get('/api/developer/github/contents', async (req, res) => {
      try {
        const { owner, repo, path: filePath, token } = req.query;
        const headers: any = { 'Accept': 'application/vnd.github.v3+json' };
        if (token) headers['Authorization'] = `token ${token}`;
        
        const url = filePath 
          ? `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`
          : `https://api.github.com/repos/${owner}/${repo}/contents`;
        
        const response = await axios.get(url, { headers });
        const data = Array.isArray(response.data) 
          ? response.data.map((f: any) => ({
              name: f.name,
              path: f.path,
              type: f.type,
              size: f.size,
              download_url: f.download_url
            }))
          : [{ name: (response.data as any).name, path: (response.data as any).path, type: 'file', content: (response.data as any).content }];
        
        res.json(data);
      } catch (e) {
        res.status(500).json({ error: (e as Error).message });
      }
    });

    this.app.post('/api/developer/github/clone', async (req, res) => {
      try {
        const { repoUrl, targetDir, token } = req.body;
        const cloneDir = targetDir || `${OPENCLAW_WORKSPACE}/github/${Date.now()}`;
        
        let cloneCmd = `git clone ${repoUrl} ${cloneDir}`;
        if (token) {
          cloneCmd = `git clone https://${token}@${repoUrl.replace('https://', '')} ${cloneDir}`;
        }
        
        await execPromise(cloneCmd, { timeout: 60000 });
        res.json({ success: true, path: cloneDir, message: '仓库克隆成功' });
      } catch (e) {
        res.status(500).json({ error: (e as Error).message });
      }
    });

    this.app.get('/api/developer/openclaw/agents', async (req, res) => {
      try {
        const agentsPath = OPENCLAW_AGENTS;
        const workspacePath = OPENCLAW_WORKSPACE;
        const skillsPath = `${workspacePath}/skills`;
        
        const agentList: any[] = [];
        
        if (fs.existsSync(agentsPath)) {
          const agents = fs.readdirSync(agentsPath).filter((f: string) => {
            return fs.statSync(`${agentsPath}/${f}`).isDirectory();
          });
          
          for (const agent of agents) {
            const soulPath = `${agentsPath}/${agent}/SOUL.md`;
            const hasSoul = fs.existsSync(soulPath);
            agentList.push({
              name: agent,
              hasSOUL: hasSoul,
              path: `${agentsPath}/${agent}`,
              type: 'agent'
            });
          }
        }
        
        if (fs.existsSync(skillsPath)) {
          const skills = fs.readdirSync(skillsPath).filter((f: string) => {
            return fs.statSync(`${skillsPath}/${f}`).isDirectory();
          });
          
          for (const skill of skills) {
            const soulPath = `${skillsPath}/${skill}/assets/SOUL.md`;
            const hasSoul = fs.existsSync(soulPath);
            agentList.push({
              name: skill,
              hasSOUL: hasSoul,
              path: `${skillsPath}/${skill}`,
              type: 'skill'
            });
          }
        }
        
        res.json(agentList);
      } catch (e) {
        res.status(500).json({ error: (e as Error).message });
      }
    });

    this.app.post('/api/developer/openclaw/deploy', async (req, res) => {
      try {
        const { sourcePath, agentName, soulContent, skills, tools } = req.body;
        
        const targetAgentPath = `${OPENCLAW_AGENTS}/${agentName}`;
        if (!fs.existsSync(targetAgentPath)) {
          fs.mkdirSync(targetAgentPath, { recursive: true });
        }
        
        if (soulContent) {
          fs.writeFileSync(`${targetAgentPath}/SOUL.md`, soulContent);
        } else if (sourcePath && fs.existsSync(`${sourcePath}/SOUL.md`)) {
          fs.copyFileSync(`${sourcePath}/SOUL.md`, `${targetAgentPath}/SOUL.md`);
        }
        
        if (skills && skills.length > 0) {
          const skillsPath = `${targetAgentPath}/skills`;
          if (!fs.existsSync(skillsPath)) fs.mkdirSync(skillsPath, { recursive: true });
          for (const skill of skills) {
            if (skill.content) {
              fs.writeFileSync(`${skillsPath}/${skill.name}`, skill.content);
            }
          }
        }
        
        if (tools && tools.length > 0) {
          const toolsPath = `${targetAgentPath}/tools`;
          if (!fs.existsSync(toolsPath)) fs.mkdirSync(toolsPath, { recursive: true });
          for (const tool of tools) {
            if (tool.content) {
              fs.writeFileSync(`${toolsPath}/${tool.name}`, tool.content);
            }
          }
        }
        
        if (sourcePath && fs.existsSync(sourcePath)) {
          const files = fs.readdirSync(sourcePath);
          for (const file of files) {
            if (file !== 'SOUL.md' && file !== 'skills' && file !== 'tools') {
              const srcFile = path.join(sourcePath, file);
              const destFile = path.join(targetAgentPath, file);
              if (fs.statSync(srcFile).isDirectory()) {
                if (!fs.existsSync(destFile)) fs.mkdirSync(destFile, { recursive: true });
              } else {
                fs.copyFileSync(srcFile, destFile);
              }
            }
          }
        }
        
        res.json({ success: true, path: targetAgentPath, message: '智能体部署成功' });
      } catch (e) {
        res.status(500).json({ error: (e as Error).message });
      }
    });

    this.app.get('/api/developer/openclaw/agent/:name', async (req, res) => {
      try {
        const agentName = req.params.name;
        let agentPath = `${OPENCLAW_AGENTS}/${agentName}`;
        let agentType = 'agent';
        
        if (!fs.existsSync(agentPath)) {
          agentPath = `${OPENCLAW_WORKSPACE}/skills/${agentName}`;
          agentType = 'skill';
        }
        
        if (!fs.existsSync(agentPath)) {
          res.status(404).json({ error: '智能体不存在' });
          return;
        }
        
        const result: any = { name: agentName, path: agentPath, type: agentType };
        
        let soulPath = `${agentPath}/SOUL.md`;
        if (!fs.existsSync(soulPath)) {
          soulPath = `${agentPath}/assets/SOUL.md`;
        }
        if (fs.existsSync(soulPath)) {
          result.soul = fs.readFileSync(soulPath, 'utf-8');
        }
        
        const skillsPath = `${agentPath}/skills`;
        if (fs.existsSync(skillsPath)) {
          result.skills = fs.readdirSync(skillsPath).filter((f: string) => 
            fs.statSync(`${skillsPath}/${f}`).isFile()
          ).map((f: string) => ({
            name: f,
            content: fs.readFileSync(`${skillsPath}/${f}`, 'utf-8')
          }));
        }
        
        const toolsPath = `${agentPath}/tools`;
        if (fs.existsSync(toolsPath)) {
          result.tools = fs.readdirSync(toolsPath).filter((f: string) => 
            fs.statSync(`${toolsPath}/${f}`).isFile()
          ).map((f: string) => ({
            name: f,
            content: fs.readFileSync(`${toolsPath}/${f}`, 'utf-8')
          }));
        }
        
        res.json(result);
      } catch (e) {
        res.status(500).json({ error: (e as Error).message });
      }
    });

    this.app.put('/api/developer/openclaw/agent/:name', async (req, res) => {
      try {
        const agentName = req.params.name;
        const { soul, skills, tools } = req.body;
        let agentPath = `${OPENCLAW_AGENTS}/${agentName}`;
        
        if (!fs.existsSync(agentPath)) {
          agentPath = `${OPENCLAW_WORKSPACE}/skills/${agentName}`;
        }
        
        if (!fs.existsSync(agentPath)) {
          fs.mkdirSync(agentPath, { recursive: true });
        }
        
        if (soul) {
          const soulPath = `${agentPath}/SOUL.md`;
          if (!fs.existsSync(soulPath)) {
            const assetsPath = `${agentPath}/assets`;
            if (!fs.existsSync(assetsPath)) fs.mkdirSync(assetsPath, { recursive: true });
            fs.writeFileSync(`${assetsPath}/SOUL.md`, soul);
          } else {
            fs.writeFileSync(soulPath, soul);
          }
        }
        
        if (skills) {
          const skillsPath = `${agentPath}/skills`;
          if (!fs.existsSync(skillsPath)) fs.mkdirSync(skillsPath, { recursive: true });
          for (const skill of skills) {
            fs.writeFileSync(`${skillsPath}/${skill.name}`, skill.content || '');
          }
        }
        
        if (tools) {
          const toolsPath = `${agentPath}/tools`;
          if (!fs.existsSync(toolsPath)) fs.mkdirSync(toolsPath, { recursive: true });
          for (const tool of tools) {
            fs.writeFileSync(`${toolsPath}/${tool.name}`, tool.content || '');
          }
        }
        
        res.json({ success: true, message: '智能体更新成功' });
      } catch (e) {
        res.status(500).json({ error: (e as Error).message });
      }
    });

    this.app.delete('/api/developer/openclaw/agent/:name', async (req, res) => {
      try {
        const agentName = req.params.name;
        const agentPath = `${OPENCLAW_AGENTS}/${agentName}`;
        
        if (fs.existsSync(agentPath)) {
          fs.rmSync(agentPath, { recursive: true, force: true });
          res.json({ success: true, message: '智能体删除成功' });
        } else {
          res.status(404).json({ error: '智能体不存在' });
        }
      } catch (e) {
        res.status(500).json({ error: (e as Error).message });
      }
    });

    this.app.post('/api/developer/openclaw/restart', async (req, res) => {
      try {
        await execPromise('pkill -f openclaw-gateway; sleep 2; cd /root/.openclaw && nohup openclaw gateway > /tmp/openclaw.log 2>&1 &', { timeout: 30000 });
        res.json({ success: true, message: 'OpenClaw服务重启成功' });
      } catch (e) {
        res.status(500).json({ error: (e as Error).message });
      }
    });
  }
}
