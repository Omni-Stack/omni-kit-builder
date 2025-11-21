import type { UserConfig as _TsdownOptions } from "tsdown";

export type { _TsdownOptions }

export type TsdownConfig = Omit<_TsdownOptions, 'entry' | 'outDir' | 'tsconfig' | 'external' | 'onSuccess'> & {
  onSuccess?: () => Promise<any>
}

type BaseTsdownConfig = Pick<_TsdownOptions, 'outDir' | 'tsconfig' | 'external'> & {
  /**
   * tsdown config file path, or tsdown config object
   * @note `'entry'` will be ignored
   */
  tsdownConfig?: string | TsdownConfig
}

export type UserTsdownConfig = BaseTsdownConfig & {
  /**
   * entry file, only support single file
   */
  entry?: string
}

export type PreloadTsdownConfig = BaseTsdownConfig & {
  /**
   *  preload file entry points, support multiple files
   */
  entry?: string | string[]
}
