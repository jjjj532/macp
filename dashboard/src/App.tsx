import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Task, 
  Activity, 
  Settings,
  Plus,
  Play,
  Pause,
  Trash2,
  RefreshCw,
  Search,
  Bell,
  Menu,
  X,
  Bot,
  Code,
  Brain,
  Sparkles,
  FileText,
  LogOut
} from 'lucide-react';
import './index.css';

const API_BASE = 'http://localhost:3000/api';

interface Agent {
  id: string;
  name: string;
  domain: string;
  description: string;
  capabilities: { name: string; description: string }[];
  status: 'idle' | 'busy' | 'error' | 'stopped';
}

interface Task {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  priority: string;
  createdAt: string;
  completedAt?: string;
  output?: any;
  input?: any;
}

interface Log {
  level: string;
  message: string;
  timestamp: string;
  agentId?: string;
  taskId?: string;
}

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<'agent' | 'task'>('agent');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [agentsRes, tasksRes, logsRes] = await Promise.all([
        fetch(`${API_BASE}/agents`).catch(() => ({ json: () => [] })),
        fetch(`${API_BASE}/tasks`).catch(() => ({ json: () => [] })),
        fetch(`${API_BASE}/logs`).catch(() => ({ json: () => [] }))
      ]);
      
      setAgents(await agentsRes.json());
      setTasks(await tasksRes.json());
      const logsData = await logsRes.json();
      setLogs(Array.isArray(logsData) ? logsData.slice(-50) : []);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  const createTask = async (taskData: any) => {
    await fetch(`${API_BASE}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskData)
    });
    setShowModal(false);
    fetchData();
  };

  const toggleAgent = async (agentId: string, action: 'start' | 'stop') => {
    await fetch(`${API_BASE}/agents/${agentId}/${action}`, { method: 'POST' });
    fetchData();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'idle': return '#10b981';
      case 'running': case 'busy': return '#f59e0b';
      case 'completed': return '#10b981';
      case 'failed': case 'error': return '#ef4444';
      default: return '#64748b';
    }
  };

  const getAgentIcon = (domain: string) => {
    if (domain.toLowerCase().includes('code')) return <Code size={20} />;
    if (domain.toLowerCase().includes('ai') || domain.toLowerCase().includes('openclaw')) return <Brain size={20} />;
    if (domain.toLowerCase().includes('data')) return <Activity size={20} />;
    return <Bot size={20} />;
  };

  const navItems = [
    { id: 'dashboard', label: '控制台', icon: <LayoutDashboard size={20} /> },
    { id: 'agents', label: '智能体', icon: <Users size={20} />, badge: agents.length },
    { id: 'tasks', label: '任务', icon: <Task size={20} />, badge: tasks.filter(t => t.status === 'running').length || null },
    { id: 'logs', label: '日志', icon: <FileText size={20} /> },
    { id: 'settings', label: '设置', icon: <Settings size={20} /> },
  ];

  const stats = [
    { label: '智能体总数', value: agents.length, color: 'primary' },
    { label: '运行中', value: agents.filter(a => a.status === 'busy').length, color: 'success' },
    { label: '任务总数', value: tasks.length, color: 'primary' },
    { label: '成功率', value: tasks.length > 0 ? `${Math.round((tasks.filter(t => t.status === 'completed').length / tasks.length) * 100)}%` : '0%', color: 'success' },
  ];

  if (loading) {
    return (
      <div className="app">
        <div className="loading" style={{ minHeight: '100vh' }}>
          <div className="spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
        <div className="sidebar-header">
          <div className="logo">
            <div className="logo-icon">M</div>
            <span className="logo-text">MACP</span>
          </div>
        </div>
        
        <nav className="sidebar-nav">
          <div className="nav-section">
            <div className="nav-section-title">导航</div>
            {navItems.map(item => (
              <div 
                key={item.id}
                className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
                onClick={() => setActiveTab(item.id)}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badge && <span className="nav-badge">{item.badge}</span>}
              </div>
            ))}
          </div>
        </nav>

        <div style={{ padding: '16px', borderTop: '1px solid var(--border)' }}>
          <div className="nav-item" onClick={() => window.open('http://localhost:18789', '_blank')}>
            <Sparkles size={20} />
            <span>OpenClaw</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* Header */}
        <header className="main-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button className="btn btn-secondary" onClick={() => setSidebarOpen(!sidebarOpen)}>
              <Menu size={18} />
            </button>
            <h1 className="header-title">
              {navItems.find(n => n.id === activeTab)?.label || '控制台'}
            </h1>
          </div>
          
          <div className="header-actions">
            <button className="btn btn-secondary" onClick={fetchData}>
              <RefreshCw size={16} />
            </button>
            <button className="btn btn-primary" onClick={() => { setModalType('task'); setShowModal(true); }}>
              <Plus size={16} />
              新建任务
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="content">
          {activeTab === 'dashboard' && (
            <>
              {/* Stats */}
              <div className="stats-grid">
                {stats.map((stat, i) => (
                  <div key={i} className={`stat-card ${stat.color}`}>
                    <div className="stat-label">{stat.label}</div>
                    <div className="stat-value">{stat.value}</div>
                  </div>
                ))}
              </div>

              {/* Recent Tasks */}
              <div className="tasks-section">
                <div className="section-header">
                  <h2 className="section-title">
                    <Task size={20} />
                    最近任务
                  </h2>
                </div>
                <div className="tasks-list">
                  {tasks.slice(-10).reverse().map(task => (
                    <div key={task.id} className="task-item">
                      <div className="task-info">
                        <div className="task-name">{task.name}</div>
                        <div className="task-meta">
                          {new Date(task.createdAt).toLocaleString('zh-CN')}
                          {task.output?.response && ` • ${task.output.response.substring(0, 50)}...`}
                        </div>
                      </div>
                      <span className={`task-status ${task.status}`}>
                        {task.status === 'pending' ? '等待中' : 
                         task.status === 'running' ? '运行中' : 
                         task.status === 'completed' ? '已完成' : '失败'}
                      </span>
                    </div>
                  ))}
                  {tasks.length === 0 && (
                    <div className="empty-state">
                      <LogOut className="empty-icon" />
                      <div className="empty-title">暂无任务</div>
                      <p>创建第一个任务开始使用</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {activeTab === 'agents' && (
            <>
              <div className="section-header">
                <h2 className="section-title">
                  <Users size={20} />
                  智能体列表
                </h2>
              </div>
              
              <div className="agents-grid">
                {agents.map(agent => (
                  <div key={agent.id} className="agent-card">
                    <div className="agent-header">
                      <div className={`agent-avatar ${agent.status}`}>
                        {getAgentIcon(agent.domain)}
                      </div>
                      <span className={`agent-status ${agent.status}`}>
                        {agent.status === 'idle' ? '空闲' : 
                         agent.status === 'busy' ? '忙碌' : 
                         agent.status === 'error' ? '错误' : '已停止'}
                      </span>
                    </div>
                    <div className="agent-name">{agent.name}</div>
                    <div className="agent-domain">{agent.domain}</div>
                    <div className="agent-description">{agent.description}</div>
                    <div className="agent-capabilities">
                      {agent.capabilities.map((cap, i) => (
                        <span key={i} className="capability-tag">{cap.name}</span>
                      ))}
                    </div>
                    <div className="agent-actions">
                      {agent.status === 'idle' ? (
                        <button 
                          className="btn btn-secondary" 
                          style={{ flex: 1 }}
                          onClick={() => toggleAgent(agent.id, 'stop')}
                        >
                          <Pause size={14} />
                          暂停
                        </button>
                      ) : (
                        <button 
                          className="btn btn-primary" 
                          style={{ flex: 1 }}
                          onClick={() => toggleAgent(agent.id, 'start')}
                        >
                          <Play size={14} />
                          启动
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {activeTab === 'tasks' && (
            <>
              <div className="section-header">
                <h2 className="section-title">
                  <Task size={20} />
                  任务管理
                </h2>
                <button className="btn btn-primary" onClick={() => { setModalType('task'); setShowModal(true); }}>
                  <Plus size={16} />
                  新建任务
                </button>
              </div>
              
              <div className="tasks-list">
                {tasks.slice(-20).reverse().map(task => (
                  <div key={task.id} className="task-item">
                    <div className="task-info">
                      <div className="task-name">{task.name}</div>
                      <div className="task-meta">
                        {task.input?.prompt || task.input?.action || '无输入'}
                        {task.output?.response && (
                          <div style={{ marginTop: '4px', color: 'var(--success)' }}>
                            ✓ {task.output.response.substring(0, 80)}...
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span className={`task-status ${task.status}`}>
                        {task.status === 'pending' ? '等待中' : 
                         task.status === 'running' ? '运行中' : 
                         task.status === 'completed' ? '已完成' : '失败'}
                      </span>
                    </div>
                  </div>
                ))}
                {tasks.length === 0 && (
                  <div className="empty-state">
                    <Task className="empty-icon" />
                    <div className="empty-title">暂无任务</div>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'logs' && (
            <>
              <div className="section-header">
                <h2 className="section-title">
                  <FileText size={20} />
                  系统日志
                </h2>
              </div>
              
              <div className="logs-container">
                {logs.map((log, i) => (
                  <div key={i} className="log-entry">
                    <span className="log-time">
                      {new Date(log.timestamp).toLocaleString('zh-CN')}
                    </span>
                    <span className={`log-level ${log.level}`}>
                      {log.level.toUpperCase()}
                    </span>
                    <span>{log.message}</span>
                  </div>
                ))}
                {logs.length === 0 && (
                  <div className="empty-state">
                    <FileText className="empty-icon" />
                    <div className="empty-title">暂无日志</div>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'settings' && (
            <div className="chart-container">
              <h2 className="chart-title">系统设置</h2>
              <div style={{ color: 'var(--text-secondary)', lineHeight: 2 }}>
                <p><strong>API 地址:</strong> http://localhost:3000</p>
                <p><strong>OpenClaw:</strong> http://localhost:18789</p>
                <p><strong>智能体数量:</strong> {agents.length}</p>
                <p><strong>任务总数:</strong> {tasks.length}</p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modal */}
      {showModal && (
        <TaskModal 
          agents={agents}
          onClose={() => setShowModal(false)}
          onSubmit={createTask}
        />
      )}
    </div>
  );
}

function TaskModal({ agents, onClose, onSubmit }: { agents: Agent[]; onClose: () => void; onSubmit: (data: any) => void }) {
  const [name, setName] = useState('');
  const [capability, setCapability] = useState('');
  const [prompt, setPrompt] = useState('');
  const [action, setAction] = useState('chat');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const taskData = {
      name,
      requiredCapabilities: [capability],
      input: action === 'chat' 
        ? { action: 'chat', prompt }
        : action === 'list_sessions'
        ? { action: 'list_sessions' }
        : { action: 'tool', tool: prompt, args: {} }
    };
    onSubmit(taskData);
  };

  const capabilities = [...new Set(agents.flatMap(a => a.capabilities.map(c => c.name)))];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">创建新任务</h3>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">任务名称</label>
              <input 
                type="text" 
                className="form-input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="输入任务名称"
                required
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">能力</label>
              <select 
                className="form-input form-select"
                value={capability}
                onChange={e => setCapability(e.target.value)}
                required
              >
                <option value="">选择能力</option>
                {capabilities.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">操作类型</label>
              <select 
                className="form-input form-select"
                value={action}
                onChange={e => setAction(e.target.value)}
              >
                <option value="chat">AI 对话</option>
                <option value="list_sessions">列出会话</option>
                <option value="tool">调用工具</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">
                {action === 'chat' ? '对话内容' : 
                 action === 'list_sessions' ? '无' : '工具名称'}
              </label>
              {action === 'list_sessions' ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                  此操作将列出所有 OpenClaw 会话
                </p>
              ) : (
                <textarea 
                  className="form-input form-textarea"
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder={action === 'chat' ? '输入你想问的内容...' : '输入工具名称...'}
                  required={action !== 'list_sessions'}
                />
              )}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>取消</button>
            <button type="submit" className="btn btn-primary">创建任务</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default App;
