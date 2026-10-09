import {fileURLToPath} from 'node:url';
import {runDaemon} from '../../src/runtime/daemon.mjs';
import {createServiceManager} from '../../src/services/manager.mjs';
import {createLogStore} from '../../src/logs/log-store.mjs';
import {normalizeProjectDir} from '../../src/project/paths.mjs';
await runDaemon({home:process.argv[2],instanceId:process.argv[3],managerFactory:options=>createServiceManager({...options,logs:createLogStore(),prepareLaunch:async request=>({...await normalizeProjectDir(request.dir),executable:process.execPath,args:[fileURLToPath(new URL('./fake-java.mjs',import.meta.url))],port:null,mode:'classpath',profile:null}),probePort:async()=>false})});
