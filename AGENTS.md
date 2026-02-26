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

### 1. 创建 GitHub 仓库
访问 https://github.com/new 创建新仓库，仓库名建议：`macp`

### 2. 推送代码
```bash
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/你的用户名/macp.git
git push -u origin main
```

### 或者使用 gh CLI
```bash
# 安装 gh
brew install gh

# 认证
gh auth login

# 创建仓库
gh repo create macp --public --source=. --push
```
