import electron from 'electron'
import { Application } from "./application";

const { app: electronApp } = electron

const isElectron = process.env.OMNI_APP_TYPE === 'electron'

console.log(`DEBUG MODE ENV TEST: ${process.env.DEBUG}`)

if (isElectron) {
  console.log('This is electron app -', process.env.NODE_ENV)

  const isDev = process.env.NODE_ENV === 'development'

  const app = new Application(
    electronApp,
    {
      webPreferences: {
        webSecurity: false,
        nodeIntegration: true,
        contextIsolation: true,
        // preload: preloadPath,
      }
    },
    {
      url: isDev ? process.env.OMNI_RENDERER_URL || process.env.OMNI_RENDERER_DEV_URL : process.env.OMNI_RENDERER_URL,
      file: process.env.OMNI_RENDERER_FILE,
      openDevTools: isDev
    },
  )

  app.run()
    .then(async () => {
      // exit after 1 seconds, for testing purposes
      // await sleep(Number(1000))
      // electronApp.quit()
    })
    .catch((e) => {
      console.error('Failed to start application:', e);
    })
}
else {
  console.log('This is node app')
}
