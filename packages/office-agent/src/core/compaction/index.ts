/**
 * 上下文压缩（FR-6.4）：长文档超过阈值时压缩为摘要，防止上下文溢出。
 *
 * office-agent 镜像 coding-agent 的 compaction 占位；本阶段给出可用的轻量实现：
 * 按 chars/4 估算 token（与 coding-agent compaction.ts 同款启发式），超阈值时
 * 保留开头 + 结尾，中间省略，并输出摘要头。真正的 agent 级自动触发依赖
 * pi-agent-core 的上下文管理（phase-6 不新增引擎逻辑），此函数供上层按需调用。
 */

export interface CompactOptions {
	/** 触发压缩的 token 阈值（默认 48_000，留出安全余量） */
	maxTokens?: number;
	/** 保留开头比例（默认 0.6） */
	headRatio?: number;
	/** 保留结尾比例（默认 0.25） */
	tailRatio?: number;
}

/** 估算 token 数：chars/4 启发式（与 coding-agent compaction 一致）。 */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

/**
 * 压缩长文本为受限长度摘要：头部 + 省略标记 + 尾部。
 * 输入低于阈值时原样返回。
 */
export function compactOfficeContext(value: string, options: CompactOptions = {}): string {
	const maxTokens = options.maxTokens ?? 48_000;
	const headRatio = options.headRatio ?? 0.6;
	const tailRatio = options.tailRatio ?? 0.25;
	const est = estimateTokens(value);
	if (est <= maxTokens) return value;

	// 目标字符数：maxTokens * 4（保留完整中文语义的近似）
	const budget = maxTokens * 4;
	const headChars = Math.floor(budget * headRatio);
	const tailChars = Math.floor(budget * tailRatio);
	const omitCount = value.length - headChars - tailChars;
	const head = value.slice(0, headChars);
	const tail = value.slice(-tailChars);
	return `${head}\n\n…[上下文已压缩，省略约 ${omitCount} 字符（原 ${value.length} 字符 / 约 ${est} tokens → 目标 ${maxTokens} tokens）]…\n\n${tail}`;
}
