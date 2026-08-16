/**
 * office-agent 核心类型。
 *
 * phase-1：在 phase-0 的 ArtifactRef 基础上扩展为完整的 DeliveryArtifact
 * （补上 bytes / createdAt），作为统一交付物契约供 tools / office-gui 消费。
 */

export type OfficeArtifactKind = "docx" | "xlsx" | "pptx" | "png" | "pdf" | "html";

/**
 * 统一交付物对象（phase-1 FR-1.7）。
 *
 * 生成/转换/合成类工具一律返回该结构，落盘后可被 office-gui 列表/预览/下载。
 * 与 phase-0 的 ArtifactRef 结构兼容（多出 bytes / createdAt 两个字段）。
 */
export interface DeliveryArtifact {
  kind: OfficeArtifactKind;
  /** 落盘绝对路径 */
  path: string;
  /** 预览用（pdf/png 可直接预览；docx/xlsx/pptx 经 convert 转 pdf 后预览） */
  previewUrl?: string;
  /** 产物名，用于 office-gui 列表 */
  label: string;
  bytes: number;
  createdAt: number;
}

/**
 * phase-0 遗留别名：工具回写进 ToolTranscriptItem.details 的最小引用形状。
 * 兼容保留，新代码请直接用 DeliveryArtifact。
 */
export interface ArtifactRef {
  kind: OfficeArtifactKind;
  path: string;
  previewUrl?: string;
  label: string;
}

export interface OfficeToolDetails {
  artifacts?: ArtifactRef[];
  [key: string]: unknown;
}

export interface OfficeAgentSessionOptions {
  cwd?: string;
  agentDir?: string;
}
