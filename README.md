# 今天 AI Workbench

一个本地优先的个人工作台，用来管理项目、Todo、会议，以及通过 AI Chat 查询和维护这些信息。

应用默认通过 Docker 运行。Docker 镜像只提供运行环境和应用代码；个人数据保存在宿主机挂载目录里，不会被打进镜像。

## 功能概览

- 项目管理：创建项目、归档项目、按项目维护 Todo。
- Todo 管理：设置截止日期、状态、优先级和备注。
- 会议管理：创建会议，记录起止时间、关联项目和会议备注。
- 今天视图：AI Chat、未完成任务队列、周/月时间轴。
- 时间轴拖拽：把 Todo 或会议拖到某一天即可调整日期。
- AI Chat：支持查询工作台，也支持用自然语言创建项目、创建会议、添加 Todo、更新 Todo 状态。
- 用量页面：查看 Kimi 余额，以及 OpenAI API 近期开销。
- 本地数据：工作台数据写入挂载的 `workbench.json`。

## 快速开始

### 1. 克隆仓库

```bash
git clone git@github.com:Demonhero0/today_ai_workbench.git
cd today_ai_workbench
```

### 2. 配置 LLM

复制环境变量模板：

```bash
cp .env.example .env
```

如果使用 Kimi，`.env` 类似这样：

```bash
OPENAI_API_KEY=your-kimi-api-key
OPENAI_BASE_URL=https://api.kimi.com/coding/v1
OPENAI_MODEL=your-kimi-model-name
```

也可以使用其他兼容 OpenAI Chat Completions 的服务，只要配置：

```bash
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://your-compatible-api/v1
OPENAI_MODEL=your-model-name
```

`.env` 已被 Git 忽略，不要提交真实 key。

### 3. 配置用量页面（可选）

如果想在“用量”页面查看 Kimi 余额，配置：

```bash
KIMI_API_KEY=your-kimi-api-key
KIMI_BALANCE_BASE_URL=https://api.moonshot.cn/v1
```

如果 `OPENAI_BASE_URL` 已经是 Kimi/Moonshot 地址，用量接口会在没有 `KIMI_API_KEY` 时尝试复用 `OPENAI_API_KEY`。

如果想查看 OpenAI API 近期开销，需要 OpenAI Admin Key：

```bash
OPENAI_ADMIN_KEY=your-openai-admin-key
OPENAI_USAGE_DAYS=30
```

注意：这里查询的是 OpenAI API 组织费用，不是 ChatGPT Plus/Pro 网页订阅的剩余消息数。后者目前没有稳定公开 API 可供工作台直接查询。

### 4. 启动

```bash
npm run docker:up
```

打开浏览器访问：

```text
http://localhost:3000
```

### 5. 停止

```bash
npm run docker:down
```

## 数据保存在哪里

`docker-compose.yml` 会把宿主机目录挂载到容器的 `/data`：

```text
../ai-workbench-data -> /data
```

应用读写的数据文件是：

```text
/data/workbench.json
```

也就是说，实际文件在仓库的上一级目录：

```text
../ai-workbench-data/workbench.json
```

这样做的好处是：

- 个人数据不会进入 Docker 镜像。
- 重新构建镜像不会丢失数据。
- 可以单独备份 `workbench.json`。

## AI Chat 能做什么

AI Chat 会读取当前工作台 JSON，并结合当前上海时间回答问题。它也可以把一些自然语言指令转换成安全的白名单动作。

示例：

```text
创建项目：论文阅读，目标是整理 DeFi 相关论文
```

```text
给论文阅读添加 Todo：读完 BCRA 论文，截止到 2026-07-16
```

```text
明天 10:00 到 11:00 创建会议：项目同步会，关联多模态知识库
```

```text
把“整理实验记录”标记为完成
```

当前允许 AI 执行的动作：

- `create_project`
- `create_task`
- `create_meeting`
- `update_task_status`

AI 不会直接写文件，也不会执行任意代码。后端只让模型返回结构化动作，前端再按白名单更新工作台数据。

## 使用建议

### 项目

项目适合承载一组长期推进的事项，例如论文阅读、产品开发、搬家计划。每个项目可以维护自己的 Todo，项目也可以归档。

### Todo

Todo 只需要维护必要信息：

- 标题
- 截止日期
- 状态
- 优先级
- 备注

“今天”页任务队列只显示未完成 Todo，并按截止日期正序排列。已完成 Todo 仍会保留在时间轴里，方便回顾。

### 会议

会议包含：

- 主题
- 日期
- 开始时间
- 结束时间
- 关联项目
- 备注

会议备注适合记录纪要、结论和后续跟进事项。

### 时间轴

今天页和会议页都支持周视图、月视图。

可以直接拖动：

- Todo 卡片到某一天：更新 Todo 截止日期。
- 会议卡片到某一天：更新会议日期，保留原开始/结束时间。

## 常用命令

构建 Docker 镜像：

```bash
npm run docker:build
```

运行 Docker 构建和渲染测试：

```bash
npm run docker:test
```

停止容器：

```bash
npm run docker:down
```

本地开发模式：

```bash
npm install
npm run dev
```

默认推荐 Docker 流程，因为它不会在宿主机全局安装依赖，也更接近实际运行环境。

## 目录结构

```text
app/
  api/
    ai/route.ts          AI Chat 和指令解析接口
    usage/route.ts       Kimi 余额和 OpenAI API 费用查询接口
    workbench/route.ts   workbench.json 读写接口
  page.tsx               主界面和交互逻辑
  globals.css            全局样式
Dockerfile               多阶段 Docker 构建
docker-compose.yml       本地运行配置
.env.example             LLM 配置模板
tests/                   渲染和数据 API 测试
```

## Docker 设计

Dockerfile 使用多阶段构建：

- `deps`：在镜像中执行 `npm ci` 安装依赖。
- `builder`：复制源码并构建应用。
- `test`：运行测试。
- `runner`：只复制运行所需文件，启动生产服务。

`.dockerignore` 会排除宿主机的 `node_modules`、构建产物和临时目录，避免污染镜像。

## 排错

### AI Chat 提示没有配置 key

检查 `.env` 是否存在，并确认：

```bash
OPENAI_API_KEY=...
OPENAI_BASE_URL=...
OPENAI_MODEL=...
```

修改 `.env` 后需要重启：

```bash
npm run docker:down
npm run docker:up
```

### 端口 3000 被占用

修改 `docker-compose.yml`：

```yaml
ports:
  - "3001:3000"
```

然后访问：

```text
http://localhost:3001
```

### 想清空个人数据

停止容器后删除或备份数据文件：

```bash
npm run docker:down
rm ../ai-workbench-data/workbench.json
```

下次启动会重新创建一个空工作台。

### 想备份个人数据

备份这个文件即可：

```text
../ai-workbench-data/workbench.json
```

## 维护说明

提交前建议至少运行：

```bash
npm run docker:test
```

如果已经有本地依赖，也可以运行：

```bash
npm run lint
```

如果不想在宿主机安装依赖，可以在 Docker 构建阶段完成验证。
