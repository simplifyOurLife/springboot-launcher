import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {createWorkspaceStore} from '../src/backend/workspace.mjs';
import {pickProjectDirectory} from '../src/backend/folder-picker.mjs';
import {atomicState} from '../src/runtime/instance.mjs';
import {fixture} from './helpers/project-fixtures.mjs';

test('分组与导入项目写入磁盘并可恢复，移动和移除分组不修改工程', async t => {
  const f = await fixture();t.after(f.cleanup);
  const filename = path.join(f.root, 'workspace.json');
  const store = createWorkspaceStore({persist: data => atomicState(filename, data)});
  const created = await store.command({type: 'folder.create', name: '订单服务'}), id = created.folders[0].id;
  await store.importProjects([{projectKey: 'orders', dir: f.dir}], id);
  const restored = createWorkspaceStore({initialState: JSON.parse(await readFile(filename, 'utf8')), persist: data => atomicState(filename, data)});
  assert.equal(restored.snapshot().projects[0].folderId, id);
  await restored.command({type: 'folder.rename', id, name: '业务服务'});
  await restored.command({type: 'project.move', projectKey: 'orders', folderId: null});
  await restored.command({type: 'project.move', projectKey: 'orders', folderId: id});
  const removed = await restored.command({type: 'folder.remove', id});
  assert.equal(removed.folders.length, 0);
  assert.equal(removed.projects[0].folderId, null);
  assert.match(await readFile(path.join(f.dir, 'pom.xml'), 'utf8'), /<project>/);
  await restored.importProjects([{projectKey: 'orders', dir: f.dir}]);
  assert.equal(restored.snapshot().projects.length, 1);
});

test('并发分组操作按顺序提交，写盘失败不会丢失原状态或阻塞后续操作', async () => {
  let rejectWrite = false;
  const store = createWorkspaceStore({persist: async () => { if (rejectWrite) throw new Error('模拟磁盘失败'); }});
  await Promise.all(['A', 'B'].map(name => store.command({type: 'folder.create', name})));
  assert.deepEqual(store.snapshot().folders.map(folder => folder.name), ['A', 'B']);
  rejectWrite = true;
  await assert.rejects(store.command({type: 'folder.create', name: 'C'}), {code: 'WORKSPACE_WRITE_FAILED'});
  assert.equal(store.snapshot().folders.length, 2);
  rejectWrite = false;
  await store.command({type: 'folder.create', name: 'C'});
  const copy = store.snapshot();copy.folders.length = 0;
  assert.equal(store.snapshot().folders.length, 3);
});

test('服务可在组内排序、跨组插入，顺序持久化并拒绝无效锚点', async () => {
  let saved;
  const store=createWorkspaceStore({persist:async next=>{saved=structuredClone(next);}});
  const folderA=(await store.command({type:'folder.create',name:'A'})).folders[0].id;
  const folderB=(await store.command({type:'folder.create',name:'B'})).folders[1].id;
  const info=key=>({projectKey:key,dir:path.resolve(key)});
  await store.importProjects(['a','b','c'].map(info),folderA);
  await store.importProjects(['x','y'].map(info),folderB);
  const keys=(data,id)=>data.projects.filter(p=>p.folderId===id).map(p=>p.projectKey);
  await store.command({type:'project.move',projectKey:'c',folderId:folderA,beforeProjectKey:'a'});
  assert.deepEqual(keys(store.snapshot(),folderA),['c','a','b']);
  await store.command({type:'project.move',projectKey:'c',folderId:folderA,beforeProjectKey:null});
  assert.deepEqual(keys(saved,folderA),['a','b','c']);
  await store.command({type:'project.move',projectKey:'b',folderId:folderB,beforeProjectKey:'y'});
  assert.deepEqual(keys(saved,folderA),['a','c']);assert.deepEqual(keys(saved,folderB),['x','b','y']);
  const restored=createWorkspaceStore({initialState:saved});
  assert.deepEqual(keys(restored.snapshot(),folderB),['x','b','y']);
  await assert.rejects(store.command({type:'project.move',projectKey:'a',folderId:folderA,beforeProjectKey:'y'}),{code:'INVALID_ARGUMENT'});
  await assert.rejects(store.command({type:'project.move',projectKey:'a',folderId:folderA,beforeProjectKey:123}),{code:'INVALID_ARGUMENT'});
  assert.deepEqual(keys(store.snapshot(),folderA),['a','c']);
  await store.command({type:'project.move',projectKey:'x',folderId:null,beforeProjectKey:null});
  await store.command({type:'project.move',projectKey:'y',folderId:null,beforeProjectKey:'x'});
  assert.deepEqual(keys(store.snapshot(),null),['y','x']);
  await assert.rejects(store.command({type:'project.move',projectKey:'z',folderId:folderB,beforeProjectKey:'missing'},{projectInfo:info('z')}),{code:'INVALID_ARGUMENT'});
  assert.equal(store.snapshot().projects.some(p=>p.projectKey==='z'),false);
  await store.command({type:'project.move',projectKey:'z',folderId:folderB,beforeProjectKey:'b'},{projectInfo:info('z')});
  assert.deepEqual(keys(store.snapshot(),folderB),['z','b']);
});

test('工作区拒绝无效名称、未知参数和损坏的分组引用', async () => {
  const store = createWorkspaceStore();
  await assert.rejects(store.command({type: 'folder.create', name: ' '}), {code: 'INVALID_ARGUMENT'});
  await store.command({type: 'folder.create', name: '<b>分组</b>'});
  await assert.rejects(store.command({type: 'folder.create', name: '<b>分组</b>'}), {code: 'INVALID_ARGUMENT'});
  assert.throws(() => store.command({type: 'folder.create', name: 'X', dir: '任意目录'}), {code: 'INVALID_ARGUMENT'});
  assert.throws(() => store.command({type: '__proto__'}), {code: 'INVALID_ARGUMENT'});
  assert.throws(() => createWorkspaceStore({initialState: {folders: [], projects: [{projectKey: 'p', dir: path.resolve('.'), name: 'p', folderId: 'missing'}]}}), {code: 'BACKEND_UNAVAILABLE'});
});

test('目录选择使用固定 STA 脚本与参数数组，正确保留中文路径及取消', async () => {
  const dir = 'D:\\中文 工程\\orders-api';let captured;
  const selected = await pickProjectDirectory({platform: 'win32', run: async (command, args, options) => { captured = {command, args, options};return {stdout: JSON.stringify({dir, cancelled: false})}; }});
  assert.equal(selected, dir);
  assert.equal(captured.options.shell, false);
  assert.equal(captured.options.windowsHide, true);
  assert.ok(captured.args.includes('-STA'));
  const script = Buffer.from(captured.args.at(-1), 'base64').toString('utf16le');
  assert.match(script, /FolderBrowserDialog/);
  assert.equal(script.includes(dir), false);
  assert.equal(await pickProjectDirectory({platform: 'win32', run: async () => ({stdout: '{"cancelled":true}'})}), null);
  await assert.rejects(pickProjectDirectory({platform: 'linux'}), {code: 'PICKER_UNAVAILABLE'});
  await assert.rejects(pickProjectDirectory({platform: 'win32', run: async () => ({stdout: '不是 JSON'})}), {code: 'PICKER_UNAVAILABLE'});
});
