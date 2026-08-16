# 01. MVP 实现计划与开发路线

## 1. MVP 定义

MVP 的目标不是一个“一切都能做”的 Office Agent，而是一个可演示、可体验、可扩展的办公任务型 Agent。

MVP 需要具备以下最小闭环：

- 读取办公素材：PDF、Markdown、TXT、CSV/Excel
- 抽取内容并做结构化整理
- 生成 HTML 静态页面或报告页
- 调用 Seedance 生成海报图像
- 生成邮件草稿并提供二次确认
- 将结果写回本地目录或可查看结果页

这能形成一个最小可用闭环：

输入资料 -> 抽取信息 -> 生成内容 -> 输出结果 -> 用户确认 -> 保存/发送

## 2. MVP 功能清单

### 2.1 读取与分析

- 支持读取本地文件目录中的文本资料
- 支持 PDF/Markdown/TXT/CSV/Excel 基本解析
- 识别标题、段落、要点、表格字段
- 生成结构化 summary 对象

### 2.2 报告生成

- 基于输入材料生成一份汇报结构
- 生成 HTML 页面，包括：
  - 标题
  - 摘要
  - 关键结论
  - 亮点列表
  - 附图区域
  - 结论与建议
- 输出到本地 html 文件

### 2.3 海报生成

- 接收活动主题、风格、主视觉关键词
- 生成一组海报提示词
- 调用 Seedance 生成海报候选图
- 生成海报卡片列表，展示在页面中

### 2.4 邮件协同

- 基于会议纪要或汇报摘要生成邮件草稿
- 支持标题与正文生成
- 提供邮件点击预览
- 默认不发送，先进入草稿确认状态

### 2.5 文件写出

- 将 HTML / Markdown / JSON 写入指定目录
- 保存生成结果到 project 文件夹中
- 保证能在浏览器中直接打开

## 3. MVP 架构设计

### 3.1 组件分层

#### A. Agent runtime 层

复用当前仓库中的基础能力：

- packages/agent
- packages/ai
- packages/session-backends
- packages/telemetry

#### B. Office tool 层

新增工具：

- readOfficeFile
- readOfficeDirectory
- writeGeneratedArtifact
- generateHtmlReport
- generatePosterImage
- generateEmailDraft

#### C. Workflow 层

- reportPipeline
- posterPipeline
- emailPipeline
- sessionPipeline

#### D. UI 层

- 最初可用 Web 页面进行交互
- 页面中展示：
  - 输入区
  - 任务状态
  - 结果预览
  - 审批确认区

## 4. 核心工具设计

### 4.1 readOfficeFile

输入：

- filePath
- fileType
- options: extractText, extractTables, extractTitle

输出：

- contentText
- summary
- structuredSections
- warnings

目标：

- 读取并标准化办公素材
- 为下游生成能力提供统一输入结构

### 4.2 readOfficeDirectory

输入：

- directoryPath
- acceptedExtensions

输出：

- fileList
- totalFiles
- scanningSummary

目标：

- 批量读取素材目录中的多个文件
- 让 Agent 能对多个资料统一处理

### 4.3 writeGeneratedArtifact

输入：

- type: html | markdown | json | txt
- outputPath
- content
- overwrite

输出：

- savedPath
- status

目标：

- 生成内容可落盘
- 让 Agent 具备真实输出能力

### 4.4 generateHtmlReport

输入：

- title
- summary
- sections
- imageUrls
- stylePreset

输出：

- htmlContent
- outputPath

目标：

- 生成可浏览的 HTML 报告页
- 用于展示会议纪要、活动页、市场报告

### 4.5 generatePosterImage

输入：

- prompt
- style
- ratio
- seed
- negativePrompt

输出：

- imageUrl
- localPath
- generationMeta

目标：

- 调用 Seedance 生成海报图
- 将生成图挂到 HTML 报告页或海报页中

### 4.6 generateEmailDraft

输入：

- recipient
- subjectHint
- context
- tone

输出：

- subject
- body
- summary

目标：

- 自动生成邮件草稿
- 让用户确认后再真正执行发送

## 5. 关键数据结构

建议统一定义以下对象：

### 5.1 OfficeDocument

- id
- fileName
- fileType
- sourcePath
- extractedText
- summary
- metadata
- tags

### 5.2 GeneratedReport

- id
- title
- summary
- sections
- htmlContent
- assetPaths
- createdAt

### 5.3 PosterAsset

- id
- prompt
- style
- outputPath
- sourceModel
- status

### 5.4 EmailDraft

- id
- recipient
- subject
- body
- tone
- status

## 6. 工作流设计

### 6.1 报告生成流程

1. 用户提供资料目录或文件
2. Agent 分析并读取文件
3. 提取文档结构与要点
4. 生成总结与章节结构
5. 生成 HTML 页面
6. 输出结果并预览
7. 用户确认后保存/导出

### 6.2 海报生成流程

1. 用户提供主题、关键词、目标受众
2. Agent 生成海报 brief
3. 调用 Seedance 生成多个候选图
4. 返回候选图列表
5. 用户筛选后将图嵌入 HTML 展示页

### 6.3 邮件生成流程

1. 读取上下文：邮件、会议内容、任务信息
2. 生成邮件标题和内容草稿
3. 用户确认后生成最终文本
4. 可选择发送到邮件系统或保存为草稿

## 7. MVP 实施步骤

### Step 00：项目骨架搭建

- 新建 office-agent package
- 初始化 TS 项目与目录结构
- 复用 Pi Agent runtime
- 准备 session、AI、telemetry 依赖

### Step 01：文件读取能力

- 实现文件扫描与读取能力
- 支持读取 common office file types
- 抽取文本与结构化摘要
- 输出统一 Document 对象

### Step 02：生成能力

- 增加 HTML 生成模板
- 允许输出一页静态报表
- 提供本地保存功能

### Step 03：海报能力

- 接入 Seedance API
- 设计 prompt schema
- 实现图像生成工具
- 将生成图嵌入 HTML

### Step 04：邮件能力

- 实现邮件草稿生成器
- 加入会话上下文和模板支持
- 让用户在网页中审阅邮件内容

### Step 05：UI 与审批流

- 引入一个基础 Web UI
- 让用户看到输入、产出、状态和日志
- 增加人工确认机制

## 8. MVP 验收标准

以下标准用于判断是否完成 MVP：

- 能读取本地资料文件并抽取内容
- 能生成至少一种 HTML 报告页面
- 能生成海报图像并展示在页面中
- 能生成邮件草稿
- 所有输出都可保存到本地文件
- 用户可以在页面中审阅结果
- 发邮件/保存文件等危险动作都有确认机制

## 9. 技术风险与对策

### 9.1 PDF/Word 解析兼容性

对策：

- 优先支持最稳定格式：PDF、Markdown、TXT、CSV
- 对复杂 Office 文档做“提取优先、人工校验”策略

### 9.2 海报生成不稳定

对策：

- 先支持多个候选图
- 让用户在前端选择结果
- 引入 prompt 模板和风格枚举

### 9.3 自动执行风险

对策：

- 默认所有写入和发送动作都进入确认流
- 默认 dry-run 模式优先

## 10. 后续迭代路线

### 第二阶段：办公协作增强

- 真实邮件服务接入
- Team / Notion / wiki 索引
- 任务状态管理
- 生成会议纪要模板

### 第三阶段：企业工作流

- 多角色权限
- 审批流
- 审计日志
- 企业数据隔离与知识库聚合

## 11. 总结

这一版 MVP 的重点并不是让 Agent 无限自动化，而是让它在一个明确的办公场景中顺畅完成：

- 读取材料
- 提炼内容
- 生成结果
- 保存和展示
- 让用户进行确认后再执行高风险动作

这符合 Office Agent 的价值定位，也最适合在当前项目架构上快速落地与迭代。
