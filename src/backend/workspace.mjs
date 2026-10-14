import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fail} from '../core/errors.mjs';

// 分组是启动器的逻辑目录，不创建、移动或删除磁盘上的工程。
export function createWorkspaceStore({initialState = {folders: [], projects: []}, persist = async () => {}} = {}) {
  if (!initialState || !Array.isArray(initialState.folders) || !Array.isArray(initialState.projects)) fail('BACKEND_UNAVAILABLE', '工作区记录无效，请检查本机私有目录');
  const folderIds = new Set(), projectKeys = new Set();
  let invalid = initialState.folders.length > 200 || initialState.projects.length > 2000;
  for (const folder of initialState.folders) {
    if (!folder || typeof folder.id !== 'string' || !folder.id || folder.id.length > 128 || folderIds.has(folder.id) || typeof folder.name !== 'string' || !folder.name.trim() || folder.name.length > 48 || /[\x00-\x1f]/.test(folder.name)) invalid = true;
    folderIds.add(folder?.id);
  }
  for (const project of initialState.projects) {
    if (!project || typeof project.projectKey !== 'string' || !project.projectKey || projectKeys.has(project.projectKey) || typeof project.dir !== 'string' || !path.isAbsolute(project.dir) || typeof project.name !== 'string' || (project.folderId !== null && !folderIds.has(project.folderId))) invalid = true;
    projectKeys.add(project?.projectKey);
  }
  if (invalid || Buffer.byteLength(JSON.stringify(initialState)) > 900000) fail('BACKEND_UNAVAILABLE', '工作区记录无效，请检查本机私有目录');
  let state = structuredClone(initialState), queue = Promise.resolve();
  const snapshot = () => structuredClone(state);
  const folderExists = (data, id) => id === null || data.folders.some(folder => folder.id === id);
  const validateFolder = (data, id) => { if (!folderExists(data, id)) fail('INVALID_ARGUMENT', '文件夹不存在，请刷新工作区'); };
  function nameFor(data, input, exceptId) {
    if (typeof input !== 'string' || !input.trim() || input.trim().length > 48 || /[\x00-\x1f]/.test(input)) fail('INVALID_ARGUMENT', '文件夹名称需为 1 至 48 个可见字符');
    const name = input.trim();
    if (data.folders.some(folder => folder.id !== exceptId && folder.name.toLocaleLowerCase() === name.toLocaleLowerCase())) fail('INVALID_ARGUMENT', '已有同名文件夹，请换一个名称');
    return name;
  }
  function mutate(change) {
    const pending = queue.then(async () => {
      const next = snapshot();
      change(next);
      if (next.folders.length > 200 || next.projects.length > 2000 || Buffer.byteLength(JSON.stringify(next)) > 900000) fail('INVALID_ARGUMENT', '工作区已达到容量限制');
      try { await persist(next); }
      catch { fail('WORKSPACE_WRITE_FAILED', '工作区保存失败，本次修改未生效，请检查本机私有目录'); }
      state = next;
      return snapshot();
    });
    queue = pending.catch(() => {});
    return pending;
  }
  return {
    snapshot,
    validateFolder: id => validateFolder(state, id),
    command(command, {projectInfo} = {}) {
      if (!command || typeof command !== 'object' || Array.isArray(command)) fail('INVALID_ARGUMENT', '工作区操作无效');
      const schemas = {'folder.create': ['type', 'name'], 'folder.rename': ['type', 'id', 'name'], 'folder.remove': ['type', 'id'], 'project.move': ['type', 'projectKey', 'folderId', 'beforeProjectKey'], 'project.remove': ['type', 'projectKey']};
      const allowed = Object.hasOwn(schemas, command.type) ? schemas[command.type] : null;
      if (!allowed || Object.keys(command).some(key => !allowed.includes(key))) fail('INVALID_ARGUMENT', '工作区操作参数无效');
      return mutate(next => {
        if (command.type === 'project.remove') {
          if (!next.projects.some(item => item.projectKey === command.projectKey)) fail('INVALID_ARGUMENT', '项目不存在，请刷新工作区');
          next.projects = next.projects.filter(item => item.projectKey !== command.projectKey);
        }
        if (command.type === 'folder.create') next.folders.push({id: randomUUID(), name: nameFor(next, command.name)});
        if (command.type === 'folder.rename' || command.type === 'folder.remove') {
          const folder = next.folders.find(item => item.id === command.id);
          if (!folder) fail('INVALID_ARGUMENT', '文件夹不存在，请刷新工作区');
          if (command.type === 'folder.rename') folder.name = nameFor(next, command.name, folder.id);
          else {
            next.folders = next.folders.filter(item => item.id !== folder.id);
            for (const project of next.projects) if (project.folderId === folder.id) project.folderId = null;
          }
        }
        if (command.type === 'project.move') {
          validateFolder(next, command.folderId);
          let project = next.projects.find(item => item.projectKey === command.projectKey);
          // MCP 直接启动但尚未导入的服务，由后台提供可信记录，与首次移动一起原子保存。
          if(!project&&projectInfo?.projectKey===command.projectKey){
            if(typeof projectInfo.dir!=='string'||!path.isAbsolute(projectInfo.dir))fail('INVALID_ARGUMENT','导入项目记录无效');
            project={projectKey:projectInfo.projectKey,dir:projectInfo.dir,name:path.basename(projectInfo.dir),folderId:command.folderId};
            next.projects.push(project);
          }
          if (!project) fail('INVALID_ARGUMENT', '请先导入项目，再调整所在文件夹');
          // 以目标项目为插入锚点，数组顺序直接持久化，其他分组的相对顺序保持不变。
          if (Object.hasOwn(command, 'beforeProjectKey')) {
            const anchor = command.beforeProjectKey;
            if (anchor !== null && (typeof anchor !== 'string' || !anchor)) fail('INVALID_ARGUMENT', '排序目标参数无效');
            if (anchor !== null && !next.projects.some(item => item.projectKey === anchor && item.folderId === command.folderId)) fail('INVALID_ARGUMENT', '排序目标不在目标文件夹中，请刷新工作区');
            if (anchor === project.projectKey) return;
            next.projects = next.projects.filter(item => item !== project);
            project.folderId = command.folderId;
            const index = anchor === null ? next.projects.findLastIndex(item => item.folderId === command.folderId) + 1 : next.projects.findIndex(item => item.projectKey === anchor);
            next.projects.splice(index, 0, project);
            return;
          }
          project.folderId = command.folderId;
        }
      });
    },
    importProjects(infos, folderId = null, {removeKeys = []} = {}) {
      return mutate(next => {
        validateFolder(next, folderId);
        // 仅移除重新检查后确定为基础模块的导入记录，不触碰磁盘工程。
        next.projects=next.projects.filter(project=>!removeKeys.includes(project.projectKey));
        for (const info of infos) {
          const record = {projectKey: info.projectKey, dir: info.dir, name: path.basename(info.dir), folderId};
          if (typeof record.projectKey !== 'string' || typeof record.dir !== 'string' || !path.isAbsolute(record.dir)) fail('INVALID_ARGUMENT', '导入项目记录无效');
          const index = next.projects.findIndex(item => item.projectKey === record.projectKey);
          if (index < 0) next.projects.push(record);
          else next.projects[index] = record;
        }
      });
    }
  };
}
