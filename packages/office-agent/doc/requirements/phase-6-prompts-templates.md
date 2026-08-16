# Phase 6 · 领域提示与模板库

> **阶段目标**：在 phase-2/5 工具就绪后，通过**注入办公领域系统提示、海报模板库、WPS 对象模型速查**，显著提升 LLM 输出质量与一次性成功率。本阶段只换 `office-agent` 的**系统提示内容**（架构文档 §2.11 `resource-loader` / §2.12 `buildSystemPrompt()`——那是 `office-agent` 镜像 coding-agent 时一并搭好的部分），**不新增工具、不改 `pi-*` 引擎逻辑**。
>
> **与 coding-agent 的对应**：coding-agent 自身也有一套 coding 领域的系统提示片段与 skills（§2.11/§2.12）——本阶段做的，就是把那套"代码领域提示"替换成"办公领域提示 + 模板"。机制完全一致，只换文字。

---

## 1. 功能需求（FR）

| 编号 | 需求 | 落点 |
|---|---|---|
| FR-6.1 | 办公领域系统提示：说明三大方向能力、引导模型优先用结构化入参调用工具 | `buildSystemPrompt()` |
| FR-6.2 | 海报模板库 JSON（社媒/促销/KV/活动头图，含尺寸/留白/字体规范） | `office-tools/src/poster/templates/*.json` |
| FR-6.3 | WPS 对象模型速查（JSA 宏常用 API：Range/Worksheet/Paragraph/Slide） | 提示片段 / 参考文件 |
| FR-6.4 | 压缩提示（长文档上下文）：告知模型何时触发 compaction、摘要风格 | 复用 `_checkCompaction` + 提示 |

## 2. 系统提示结构（FR-6.1）

```text
你是「办公智能体」，擅长三类任务：
1) WPS 三件套：用 wps_writer/wps_sheet/wps_slide 生成 docx/xlsx/pptx。
   - 优先传结构化 sections/rows/slides，不要塞大段纯文本。
2) 海报：先 poster_generate 出背景图，再 poster_compose 叠加中文文字层（禁止指望出图出中文）。
3) HTML demo：用 html_generate 出单文件 HTML，html_preview 校验后迭代，html_deploy 部署。
工具入参请严格匹配 schema；多版本需求用会话分支（v1/v2）管理。
```

## 3. 海报模板库示例（FR-6.2）

```json
// office-tools/src/poster/templates/social-promo.json
{
  "id": "social-promo",
  "name": "社媒促销海报",
  "width": 1080, "height": 1080,
  "title": { "fontSize": 72, "weight": "bold", "color": "#E60012", "marginTop": 120 },
  "subtitle": { "fontSize": 36, "color": "#333", "marginTop": 40 },
  "logo": { "position": "bottom-right", "size": 120 },
  "qr": { "position": "bottom-left", "size": 160 }
}
```
> `poster_compose`（phase-1）读取模板决定文字层位置/字号，使同一提示产出风格统一。

## 4. WPS 对象模型速查（FR-6.3，喂给 JSA 宏生成）

```text
JSA 宏常用：
- 表格：Application.Worksheets("Sheet1").Range("A1").Value = "x"; .Font.Bold=true;
- 文字：Application.ActiveDocument.Paragraphs.Add().Range.Text = "标题";
- 演示：Application.ActivePresentation.Slides.Add().Shapes.AddTextbox(...);
详见 open.wps.cn/docs/client/js-macro/
```

## 5. 验收标准（AC）

- [ ] AC-6.1 注入系统提示后，对"写季度总结 docx"类请求，模型首次调用 `wps_writer` 的入参结构化程度明显提升（人工抽检 5 例）。
- [ ] AC-6.2 `poster_compose` 指定模板 id 后，同一提示多次产出风格一致。
- [ ] AC-6.3 `wps_macro` 生成的宏能引用速查中的标准 API（减少语法错误）。
- [ ] AC-6.4 长文档（>50k tokens）触发 compaction，摘要进入上下文不溢出。

## 6. 里程碑与退出条件

- **退出条件**：办公智能体在"提示+模板"加持下达到可用质量，全 6 阶段闭环完成。
- 至此需求集全部 phase 完成；后续进入真实业务打磨（企业知识接入、权限、批量 CLI 等），不在本需求集范围。
- **总回看**：自底向上 0→6，每阶段只增量、接口稳定、`pi-*` 引擎零改动（不重造），与设计文档完全对齐。
