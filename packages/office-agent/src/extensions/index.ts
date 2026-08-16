/**
 * office-agent 扩展系统（doc/modules/extensions.md）。
 *
 * 让用户不改 core 代码即可追加自定义办公工具/提示/命令；
 * SDK 通过 `createOfficeAgentSession({ extensions })` 注入（见 core/sdk.ts）。
 */
export {
	loadOfficeExtensionsFromDir,
	runOfficeExtensions,
} from "./runner.ts";
export type {
	ExtensionRegistration,
	OfficeExtensionAPI,
	OfficeExtensionFactory,
	OfficeInlineExtension,
} from "./types.ts";
