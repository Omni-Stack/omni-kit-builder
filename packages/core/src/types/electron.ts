import type {
  CliOptions as ElectronBuilderCliOptions,
  Configuration as ElectronBuilderConfiguration
} from 'electron-builder'
import type { PreloadTsdownConfig } from './tsdown'

export interface ElectronBuildConfig {
  /**
   * @default false
   */
  disabled?: boolean
  /**
   * electron-builder config or electron-builder config file path
   */
  config?: string | ElectronBuilderConfiguration
  /**
   * electron-builder cli config
   */
  cliOptions?: ElectronBuilderCliOptions
  /**
   * Will be executed when electron-builder build is complete
   */
  afterBuild?: () => Promise<void>
}

export type RendererConfig = {
  //#region dev
  /**
   * @default try `file://${path.join(renderer.cwd, renderer.entry)}` - if no `renderer.devUrl`
   */
  devUrl?: string;
  //#endregion

  //#region Server mode
  /**
   * Renderer Url - Server mode
   */
  url?: string | string[];
  /**
   * wait for the renderer process ready timeout - Server mode
   * @default 5000
   */
  waitTimeout?: number
  /**
   * whether to wait for the renderer process ready - Server mode
   */
  waitForRenderer?: boolean
  //#endregion

  //#region common
  /** @default process.cwd() */
  cwd?: string;
  /**
   * relative path
   * based on `renderer.cwd`
   * The directory needs to be copied to `outDir` during the build
   */
  assets?: string[]
  //#endregion

  //#region Static mode
  /**
   * relative path
   * based on `renderer.cwd` - Static mode
   * @default 'dist' - if no `renderer.url`
   */
  outDir?: string;
  /**
   * relative path
   * based on `renderer.cwd` - Static mode
   * @default 'index.html' - if no `renderer.url`
   */
  entry?: string
  //#endregion
}

export interface ElectronConfig {
  /**
   * electron-builder configuration
   */
  build?: ElectronBuildConfig
  /**
   * The build configuration of the preload file
   */
  preload?: PreloadTsdownConfig
  renderer?: RendererConfig
}
