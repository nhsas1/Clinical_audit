export function band(value:number|null|undefined){ if(value==null)return 'neutral'; return value>=90?'good':value>=80?'warning':'critical'; }
export function bandLabel(value:number|null|undefined){ if(value==null)return 'Not scored'; return value>=90?'On target':value>=80?'Watch':'Below target'; }
export function daysSince(date:string){ return Math.max(0,Math.floor((Date.now()-new Date(date).getTime())/86400000)); }
export function fmtDate(date:string){ return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(date)); }
