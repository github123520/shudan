# Qidiantu Booklist Intel

一个面向手机浏览器的书单情报工具。它可以按书名搜索起点图里的书籍，抓取某本书被哪些书单收录过，以及对应评语，并支持多本书交集找书单。

## 核心特点

- 直接用网页 GUI 操作
- 支持按书名搜索，不用手动找书 ID
- 支持创建抓取任务
- 支持查看抓取任务状态
- 支持查看单书书单评语结果
- 支持多本书交集找书单
- 默认使用文件存储，不需要先部署数据库
- 如果配置 PostgreSQL，会自动切换到 PostgreSQL

## 快速开始

```bash
npm install
npm run dev
```

打开：

```text
http://127.0.0.1:3000
```

只做命令行抓取：

```bash
npm run crawl:book -- 1015648531 2
```

## 存储模式

默认不用数据库，数据会写到：

```text
data/store
```

这对新手部署最省事：Zeabur 只部署一个 `shudan` 服务就能跑。

需要注意：如果云平台没有挂持久化硬盘，重新部署后文件数据可能会清空。等你确认这个工具真的常用，再考虑加 PostgreSQL 或挂持久化磁盘。

## PostgreSQL 可选

如果你想用 PostgreSQL，只要配置任意一个连接变量即可：

```bash
DATABASE_URL=postgresql://user:password@host:5432/database
POSTGRES_CONNECTION_STRING=postgresql://user:password@host:5432/database
POSTGRES_URI=postgresql://user:password@host:5432/database
```

也可以使用 Zeabur 给 PostgreSQL 服务暴露的分散变量：

```bash
POSTGRES_HOST=
POSTGRES_PORT=
POSTGRES_USER=
POSTGRES_USERNAME=
POSTGRES_PASSWORD=
POSTGRES_DATABASE=
POSTGRES_DB=
```

应用启动时会自动识别。

## Zeabur 部署

最简单版本：

1. 只部署 GitHub 仓库 `github123520/shudan`
2. 不需要新建 PostgreSQL
3. 让 Zeabur 使用仓库里的 `Dockerfile`
4. 部署完成后打开公网域名

建议环境变量：

```bash
PORT=3000
QIDIANTU_BASE_URL=https://www.qidiantu.com
QIDIANTU_DELAY_MS=10000
QIDIANTU_TIMEOUT_MS=20000
OUTPUT_DIR=./data/books
STORAGE_DIR=./data/store
```

后续想长期保存数据时，可以再加 PostgreSQL 或给 `data` 目录挂持久化硬盘。

## API

- `GET /` Web GUI
- `GET /api`
- `GET /health`
- `GET /search/books?q=书名`
- `GET /books/:bookId/plan`
- `POST /jobs/crawl-book`
- `GET /jobs/:jobId`
- `GET /books/:bookId`
- `POST /search/booklists/intersection`

## 开发命令

```bash
npm run typecheck
npm run build
npm run start
```
