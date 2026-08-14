# 06：真正的 multi-agent 架构

## 背景

在 03/04/05 中，office-agent 已经具备了单流程执行能力：读取文件、抽取内容、生成报告/邮件/海报、输出产物。这个阶段的目标不是继续加功能，而是把它升级成真正的 multi-agent 系统。

也就是说：

- 不是一个单一 agent 处理所有事情
- 而是多个角色分工协作
- 每个角色只负责一个清晰职责
- 通过消息和共享上下文完成任务

## 目标架构

建议拆成以下 5 个角色：

### 1. Planner

职责：

- 判断任务类型
- 生成执行计划
- 拆分子任务
- 决定需要哪些文件/哪些输出物

输入：

- 用户需求
- 文件列表
- 所需目标（总结/汇报/邮件/海报）

输出：

- plan.json
- task list
- execution order

### 2. Reader

职责：

- 扫描目录
- 识别文件类型
- 提取正文内容
- 抽取结构化信息
- 输出标准 document object

输入：

- Office 文件路径
- 目录信息

输出：

- 结构化数据结构
- document summary
- key tables / sections

### 3. Writer

职责：

- 生成 HTML 报告
- 生成邮件正文
- 生成海报 prompt
- 生成汇报文案

输入：

- 结构化提取结果
- 用户 audience / style / goal

输出：

- report.html
- email draft
- poster prompt
- summary text

### 4. Reviewer

职责：

- 检查输出是否完整
- 文案是否清晰
- 是否符合目标受众
- 是否缺少关键结论
- 检查是否需要补充数据或减弱表达

输入：

- 生成好的 report / email / poster prompt

输出：

- review result
- revision notes
- approved output

### 5. Executor

职责：

- 调用真正的文件写出能力
- 生成最终 artifacts
- 保管输出目录
- 触发邮件发送、图片生成等业务动作

输入：

- 已审核产物
- 目标输出目录

输出：

- 可交付文件集合
- 成功/失败状态
- 执行日志

## 数据流

```text
User request
  -> Planner
      -> task plan
  -> Reader
      -> extracted office content
  -> Writer
      -> draft report / email / poster
  -> Reviewer
      -> approved output
  -> Executor
      -> final artifacts
```

## 架构原则

### 1. 角色隔离

每个角色只关心自己的输入输出，不混合职责。

### 2. 共享上下文

所有角色通过一个统一 context 共享：

```ts
interface OfficeAgentContext {
  inputFiles: string[];
  taskPlan: string[];
  extractedDocuments: Record<string, unknown>;
  drafts: {
    report?: string;
    email?: string;
    posterPrompt?: string;
  };
  review?: string;
  artifacts: string[];
}
```

### 3. 分阶段执行

- 计划
- 提取
- 生成
- 审查
- 执行

不是“一步到底”

### 4. 可回退

任何角色失败时，都可以进入 fallback mode：

- Reader 失败 -> 退回到文本扫描
- Writer 失败 -> 生成通用模板
- Reviewer 失败 -> 走默认检查
- Executor 失败 -> 保留中间产物

## 适合的实现方式

在 monorepo 中，建议按功能目录拆：

```text
packages/office-agent/
  src/
    agents/
      planner.ts
      reader.ts
      writer.ts
      reviewer.ts
      executor.ts
    runtime/
      agent-runtime.ts
      shared-context.ts
    workflows/
      office-workflow.ts
      multi-agent-workflow.ts
```

## 关键价值

真正的 multi-agent 设计带来的价值：

- 更好的负责人分工
- 更可控的输出质量
- 更容易在不同阶段加入审核和回退
- 更容易接到真实 API / Office services / AI services

## 评估标准

这个阶段完成的标志：

- 任务可以分解成多个角色协作
- 每个角色都有清晰输出
- 最终产物是经过 review 的
- 单个角色失败不会直接导致全部失败

## 下一步

06 完成后，下一步应该是：

- 把这些角色真正写成可执行代码
- 建出最小 multi-agent 工作流
- 验证 planner -> reader -> writer -> reviewer -> executor 的链路

这样 office-agent 才真正从 demo 阶段进入工程化 agent 阶段。
