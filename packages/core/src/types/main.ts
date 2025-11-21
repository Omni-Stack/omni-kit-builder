import type { UserConfig as _TsdownOptions } from "tsdown";

import type { UserTsdownConfig } from "./tsdown"
import type { ElectronConfig, RendererConfig } from "./electron"
import type { Awaitable } from "../utils";

export type AppType = 'node' | 'electron'

export type UserConfigFn = (
  inlineConfig: InlineConfig,
) => Awaitable<UserConfig>

export type UserConfigExport = Awaitable<UserConfig | UserConfigFn>

export type ResolvedConfig = Readonly<{
  cwd: string
  type: AppType
  main: string
  args: string[] | DevArgs
  buildOnly: boolean
  runOnly: boolean
  debugCfg: DebugConfig
  tsdownConfigs: _TsdownOptions[]
  electron: Omit<ElectronConfig, 'preload'>
} & Pick<UserConfig, 'afterBuild'>>

export type DevArgs = Partial<Record<AppType, string[]>>

export interface DebugConfig {
  enabled?: boolean
  args?: string[] | DevArgs
  env?: Record<string, string>
  sourcemapType?: 'file' | 'inline'
  buildOnly?: boolean
}

//#region extends for AppType - electron
export interface UserConfig {
  /**
   * Some configuration for electron
  */
  electron?: ElectronConfig
}

export interface InlineConfig {
  /**
   * preload file entry
   */
  preload?: string
  /**
   * electron-builder config file
  */
  electronBuilderConfig?: string
  renderer?: RendererConfig
}
//#endregion

export interface UserConfig extends UserTsdownConfig {
  /**
   * App type, `'node'` or `'electron'`
   * @default 'node'
   */
  type?: AppType
  /**
   * The entry of the application
   * @default 'package.json'.main
   */
  main?: string
  /**
   * Arguments passed to the command in development mode
   */
  args?: string[] | DevArgs
  /**
   * Only prebuild files and won't run the application in development mode
   * @default false
   */
  buildOnly?: boolean
  /**
   * Skip prebuild and run the application
   * @default false
   */
  runOnly?: boolean
  /**
   * Will be executed when tsdown build is complete
   */
  afterBuild?: () => Promise<void>
  /**
   * Debug configuration
   */
  debugCfg?: DebugConfig
}

export interface InlineConfig extends UserConfig {
  /**
   * Specify config file
   * If set to false, will not load config file
   */
  configFile?: string | false
  /**
   * Run in debug mode
   */
  debug?: boolean
}
