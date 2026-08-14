# 04：真实 Office 文档解析增强

## 背景

当前 office-agent 已经具备最小闭环：读取输入文件、生成摘要、生成 HTML 报告与 preview、生成邮件草稿和海报 brief。这个阶段的目标是把它从“文本摘要工具”升级成真正的 Office 助手，而不是只读简单的 txt / md / csv。

也就是说，04 的核心任务不是再造 CLI，而是让 agent 能真实解析常见 Office 文件格式，并把内容抽取为结构化信息。

## 目标

在这个阶段，office-agent 应该能处理以下文件类型：

- .docx
- .pdf
- .xlsx
- .pptx
- 目录批量扫描
- 表格与文本结构抽取

并将结果转换成统一结构：

- title
- summary
- sections
- tables
- bullet points
- metadata

最终输出可以用于后续汇报、HTML 页面、邮件草稿、海报文案生成。

## 核心能力

### 1. .docx 解析

支持：

- 文本段落抽取
- 标题与小节识别
- 列表提取
- 图片描述占位
- 章节摘要

建议实现方式：

- 使用 mammoth（文档文本抽取）
- 解析 Word 标题层级
- 抽取段落和列表为统一结构

输出示例：

```json
{
  "title": "年度预算汇报",
  "summary": "本季度收入增长 18%，成本控制在预期范围内。",
  "sections": [
    {
      "title": "财务概览",
      "content": "收入同比增长 ...",
      "bullets": ["收入增长 18%", "费用支出下降 6%"]
    }
  ]
}
```

### 2. .pdf 解析

支持：

- 标题和正文抽取
- 页面层级结构
- 表格内容识别
- 关键段落提炼

建议实现方式：

- 使用 pdfjs 或 pdf-parse 等库
- 对 PDF 文本进行清洗和归一化
- 对页面结构保留标题和段落边界

注意事项：

- PDF 解析通常不如 DOCX 稳定，最好做“最佳努力提取”
- 如果解析失败，返回结构化 fallback 提示，而不是直接崩掉

### 3. .xlsx 表格提取

支持：

- 工作表扫描
- 表头识别
- 数据读成 JSON
- 关键指标提取
- 行列与汇总值识别

输出示例：

```json
{
  "sheetName": "销售数据",
  "columns": ["日期", "地区", "收入", "增长率"],
  "rows": [
    {"日期": "2026-01", "地区": "华北", "收入": 120000, "增长率": 12.3}
  ],
  "summary": "华北区收入领先，增长率高于整体平均值。"
}
```

### 4. .pptx 提纲抽取

支持：

- 每页文本提取
- 标题与副标题识别
- 演讲大纲归纳
- 关键结论提取

输出示例：

```json
{
  "title": "2026 第三季度业务回顾",
  "slides": [
    {"title": "市场概况", "summary": "市场增速维持健康水平"},
    {"title": "重点项目", "summary": "本季度已推进三项重点项目"}
  ]
}
```

## 目录批量扫描

应支持扫描一个目录，递归发现：

- .docx
- .pdf
- .xlsx
- .pptx
- .md
- .txt
- .csv
- .html

并对每个文件执行：

- 文件类型识别
- 内容抽取
- 结构化总结
- 汇总到统一列表

目录扫描规则：

- 忽略隐藏目录
- 跳过大文件或超时文件
- 对单个文件错误做容错
- 保留文件路径与 metadata

## 结构化输出设计

新增统一的数据模型：

```ts
export interface OfficeExtractedDocument {
  id: string;
  fileName: string;
  filePath: string;
  kind: OfficeFileKind;
  title?: string;
  summary: string;
  sections: Array<{
    title: string;
    content: string;
    bullets?: string[];
  }>;
  tables?: Array<{
    title?: string;
    columns: string[];
    rows: Record<string, string | number | boolean | null>[];
  }>;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
}
```

这样后面的 HTML / email / poster / workflow 都能复用一个标准结构，而不是每个格式单独写一套逻辑。

## 实现原则

1. 最少失败，不要因为某个文档解析失败导致整个流程中断。
2. 统一 schema，保证后续步骤只依赖标准结构。
3. 先支持主流，后扩展边缘格式。
4. 对非标准格式输出 fallback summary，而不是直接丢失。

## 关键文件

- [packages/office-agent/src/core/document-reader.ts](../src/core/document-reader.ts)
- [packages/office-agent/src/core/types.ts](../src/core/types.ts)
- [packages/office-agent/src/core/office-agent.ts](../src/core/office-agent.ts)

## 交付物

这个阶段的交付物包括：

- 真正的 Office 文档解析抽取器
- 统一的结构化 document model
- 批量目录扫描能力
- 可用于后续工作流的标准输出

## 下一步

在 04 完成后，下一阶段 05 将专注于“可执行动作”：

- 读取 Word/Excel/PPT
- 自动总结
- 生成汇报
- 生成邮件
- 生成海报 prompt
- 生成输出文件

而不是单纯解析文本。 
