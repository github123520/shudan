# API Contract

# API Contract

## `GET /`

返回接口导航。

## `GET /health`

健康检查。

返回：

```json
{
  "ok": true
}
```

## `GET /search/books?q=书名`

按书名搜索起点图中的小说结果，返回结构化候选列表。

## `GET /books/:bookId/plan`

返回抓取计划估算，不执行抓取。

返回：

```json
{
  "bookId": "1015648531",
  "title": "我真没想重生啊",
  "totalBooklists": 808,
  "totalPages": 81,
  "estimatedSecondsAtConfiguredDelay": 810
}
```

## 后续建议补充

### `POST /jobs/crawl-book`

创建单书抓取任务。

请求体：

```json
{
  "bookId": "1015648531",
  "maxPages": 2
}
```

返回：

```json
{
  "jobId": 1,
  "status": "queued"
}
```

### `GET /jobs/:jobId`

查看任务状态。

### `GET /books/:bookId`

查看一本书的聚合详情：

- 基础信息
- 抓取状态
- AI 摘要
- 高频关键词
- 全量评语分页

### `POST /search/booklists/intersection`

输入 2~n 本书，返回共现书单。

请求体：

```json
{
  "bookIds": ["1015648531", "1010868264"],
  "limit": 20
}
```
