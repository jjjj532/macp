# MACP 开发指南

## 快速同步

### 仅同步 Dashboard (UI 修改)
```bash
./sync-dashboard.sh
```

### 完整部署 (代码 + 构建)
```bash
./deploy.sh
```

## 本地服务

- Dashboard: http://localhost:3002/dashboard.html
- MACP API: http://localhost:3000/api
- OpenClaw: http://localhost:18789

## 腾讯云服务

- MACP API: http://43.140.246.228:3000/api
- Dashboard: http://43.140.246.228:3002/dashboard.html
- OpenClaw: http://43.140.246.228:18789

## GitHub 配置

### 方式一：使用 gh CLI（推荐）
```bash
# 安装 gh（如果未安装）
brew install gh

# 认证
gh auth login
# 选择 GitHub.com -> HTTPS -> Login with web browser -> Yes

# 创建仓库并推送
gh repo create macp --public --source=. --push
```

### 方式二：手动推送
1. 访问 https://github.com/new 创建仓库，名称：`macp`
2. 获取仓库 URL 后执行：
```bash
git remote add origin https://github.com/你的用户名/macp.git
git branch -M main
git push -u origin main
```
