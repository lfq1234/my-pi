export type OfficeArtifactKind = "docx" | "xlsx" | "pptx" | "png" | "pdf" | "html";

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
