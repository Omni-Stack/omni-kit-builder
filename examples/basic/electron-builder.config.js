/**
 * @type {import('electron-builder').Configuration}
 * @see https://www.electron.build/configuration/configuration
 */
const config = {
  productName: 'App Test',
  files: ['dist-electron', 'dist-renderer', 'package.json'],
  win: {
    target: 'dir',
  },
  mac: {
    target: 'dir',
    identity: null,
  },
  linux: {
    target: 'dir',
  },
}

export default config
