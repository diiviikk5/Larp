const { contextBridge, ipcRenderer } = require('electron');

const call = (name) => (args) => ipcRenderer.invoke(`larp:${name}`, args);

contextBridge.exposeInMainWorld('larp', {
  config: call('config'),
  createSpace: call('createSpace'),
  joinSpace: call('joinSpace'),
  joinAnother: call('joinAnother'),
  switchDevice: call('switchDevice'),
  retry: call('retry'),
  leaveSpace: call('leaveSpace'),
  addPerson: call('addPerson'),
  switchPerson: call('switchPerson'),
  addAgent: call('addAgent'),
  updateAgent: call('updateAgent'),
  removeAgent: call('removeAgent'),
  chooseFolder: call('chooseFolder'),
  createDemoProject: call('createDemoProject'),
  updateStatus: call('updateStatus'),
  installUpdate: call('installUpdate'),
  onUpdate: (fn) => {
    const listener = (_event, info) => fn(info);
    ipcRenderer.on('larp:update', listener);
    return () => ipcRenderer.removeListener('larp:update', listener);
  },
  setLan: call('setLan'),
  setSplash: call('setSplash'),
  setTitleBar: call('setTitleBar'),
  detectRuntimes: call('detectRuntimes'),
  codexProfile: call('codexProfile'),
  openExternal: call('openExternal'),
  appsList: call('appsList'),
  appsConnect: call('appsConnect'),
  appsDisconnect: call('appsDisconnect'),
  appsCall: call('appsCall'),
  onChange: (fn) => {
    const listener = () => fn();
    ipcRenderer.on('larp:changed', listener);
    return () => ipcRenderer.removeListener('larp:changed', listener);
  },
});
