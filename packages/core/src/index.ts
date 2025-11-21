import { createLogger, type LogType } from './utils'
import { TAG } from './constants'

export * from './types'
export * from './config'
export * from './core'

export const logger = createLogger()

export function printLog(type: LogType, ...args: any[]) {
  if (typeof logger[type] === 'function')
    (logger[type]).apply(logger, [TAG, ...args])
}
