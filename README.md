# Qidiantu Booklist Intel

这是一个偏后端的 MVP 脚手架，先把最核心的数据层搭起来：

- 按页抓取某本书在起点图里的全部书单评语
- 解析成结构化 JSON
- 写入 PostgreSQL
- 暴露公共 API
- 为后续入库、AI 总结、相似书单计算提供稳定输入

## 现在已经有的东西

- 一个可直接运行的 Fastify 服务骨架
- 一个可直接运行的 `crawl:book` 命令
- 起点图页面解析器
- 一本书抓取结果的 JSON 输出格式
- PostgreSQL 入库和迁移脚本
- 抓取任务接口
- 多本书交集找书单接口
- 数据库表设计草案
- 架构和抓取流程文档

## 快速开始

```bash
npm install
copy .env.example .env
npm run db:migrate
npm run crawl:book -- 1015648531
```

只做冒烟测试时，可以限制抓取页数：

```bash
npm run crawl:book -- 1015648531 2
```

默认会：

- 先抓图书首页，解析标题、总书单数、总页数
- 再按设定延时逐页抓取
- 最后输出到 `data/books/<bookId>.json`
- 如果配置了 `DATABASE_URL`，也可以通过 API 触发抓取并落库

## 运行 API 壳

```bash
npm run dev
```

可用接口：

- `GET /health`
- `GET /books/:bookId/plan`
- `POST /jobs/crawl-book`
- `GET /jobs/:jobId`
- `GET /books/:bookId`
- `POST /search/booklists/intersection`

## 目录结构

```text
database/
  schema.sql
docs/
  architecture.md
  api-contract.md
src/
  api/
  cli/
  crawler/
  lib/
  index.ts
```

## 当前边界

这个版本还没有接数据库、任务队列和 AI 总结，只把最值钱的第一段路走通：`抓全 -> 解析 -> 结构化输出`。

现在已经支持 PostgreSQL 落库和基础任务表，但还没有：

1. 真正的分布式队列
2. AI 摘要与关键词
3. 书单详情页抓取
4. 用户体系和收藏

## Zeabur 部署

推荐直接新建两个服务：

1. 一个 `PostgreSQL`
2. 一个从本仓库部署的 `Node.js` 服务

环境变量至少配置：

```bash
PORT=3000
QIDIANTU_BASE_URL=https://www.qidiantu.com
QIDIANTU_DELAY_MS=10000
QIDIANTU_TIMEOUT_MS=20000
OUTPUT_DIR=./data/books
DATABASE_URL=<你的 Zeabur PostgreSQL 连接串>
```

Zeabur 上建议把启动命令留空，让它直接使用 `Dockerfile`。如果你选择不用 Dockerfile，也可以手动指定：

```bash
npm install
npm run build
npm run start
```

启动命令使用：

```bash
npm run start
```

本地开发仍然建议：

```bash
npm run dev
```

## 上线后第一轮调用

1. 先试健康检查

```bash
curl https://your-domain/health
```

2. 看一本书的抓取计划

```bash
curl https://your-domain/books/1015648531/plan
```

3. 创建抓取任务

```bash
curl -X POST https://your-domain/jobs/crawl-book ^
  -H "Content-Type: application/json" ^
  -d "{\"bookId\":\"1015648531\"}"
```

4. 查询任务状态

```bash
curl https://your-domain/jobs/1
```

5. 读取入库后的书籍详情

```bash
curl https://your-domain/books/1015648531
```

6. 多书交集找书单

```bash
curl -X POST https://your-domain/search/booklists/intersection ^
  -H "Content-Type: application/json" ^
  -d "{\"bookIds\":[\"1015648531\",\"1010868264\"],\"limit\":20}"
```
