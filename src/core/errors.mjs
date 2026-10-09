export class LauncherError extends Error {
  constructor(code,message,details) { super(message); this.name='LauncherError'; this.code=code; this.details=details; }
}
export function fail(code,message,details) { throw new LauncherError(code,message,details); }
export const ok = data => ({ok:true,data});
export function failure(error) {
  return {ok:false,error:{code:error instanceof LauncherError?error.code:'INTERNAL_ERROR',message:error instanceof LauncherError?error.message:'操作失败，请查看本机后台诊断',...(error instanceof LauncherError&&error.details?{details:error.details}:{})}};
}
