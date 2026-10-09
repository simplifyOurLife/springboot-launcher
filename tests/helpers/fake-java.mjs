// 受控 Node 子进程；模拟日志和退出，不执行 Java 或业务代码。
console.log('模拟服务 中文日志');
console.error('模拟标准错误');
console.log('<b>HTML 日志按纯文本显示</b>');
if(process.argv.includes('exit'))process.exit(2);
if(!process.argv.includes('quiet'))console.log('Started Demo in 0.01 seconds');
setInterval(()=>console.log('模拟心跳'),1000).unref();
setInterval(()=>{},1000);
