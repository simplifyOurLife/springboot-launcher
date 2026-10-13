import {randomBytes,timingSafeEqual,createHash} from 'node:crypto';
import {fail} from '../core/errors.mjs';
export function createAuth({token,clock=Date.now}) {
  const cookieName='launcher_session_'+createHash('sha256').update(token).digest('hex').slice(0,16);
  const tickets=new Map(),sessions=new Map();let valid=true;
  function prune(){for(const map of [tickets,sessions])for(const [key,until]of map)if(until<=clock())map.delete(key);}
  function bearer(req){const actual=Buffer.from(req.headers.authorization||''),expected=Buffer.from(`Bearer ${token}`);return valid&&actual.length===expected.length&&timingSafeEqual(actual,expected);}
  return {
    cookieName,
    issueTicket(){if(!valid)fail('UNAUTHORIZED','后台会话已结束');prune();if(tickets.size>=256)fail('INVALID_ARGUMENT','面板访问票据过多，请稍后重试');const ticket=randomBytes(32).toString('base64url');tickets.set(ticket,clock()+60000);return ticket;},
    exchangeTicket(ticket){prune();if(!valid||typeof ticket!=='string'||!tickets.has(ticket))fail('UNAUTHORIZED','面板访问链接已过期或已使用，请重新打开');tickets.delete(ticket);const session=randomBytes(32).toString('base64url');sessions.set(session,clock()+28800000);return session;},
    authenticate(req){if(bearer(req))return 'bearer';prune();const cookie=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);return valid&&cookie&&sessions.has(cookie)?'session':null;},
    invalidate(){valid=false;tickets.clear();sessions.clear();}
  };
}
