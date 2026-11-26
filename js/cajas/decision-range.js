const DAY=86400000,OFFSET=3*3600000;
const dateFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'});
export function argentinaDate(value=Date.now()){
 const p=Object.fromEntries(dateFormatter.formatToParts(new Date(value)).map(x=>[x.type,x.value]));
 return p.year+'-'+p.month+'-'+p.day;
}
export function dayStart(key){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(key||''))throw Error('Seleccioná ambas fechas.');
 const n=Date.parse(key+'T00:00:00-03:00');
 if(!Number.isFinite(n)||argentinaDate(n)!==key)throw Error('Fecha inválida.');
 return n;
}
export function decisionRange({periodDays=30,from,to,now=Date.now()}={}){
 const clock=Number(now instanceof Date?now.getTime():now);
 if(!Number.isFinite(clock))throw Error('Fecha actual inválida.');
 const today=argentinaDate(clock),last=dayStart(today);
 if(from!==undefined||to!==undefined){
  const start=dayStart(from),endDay=dayStart(to);
  if(start>endDay)throw Error('La fecha Desde no puede ser posterior a Hasta.');
  if(endDay>last)throw Error('La fecha Hasta no puede ser futura.');
  const days=(endDay-start)/DAY+1;
  if(days>366)throw Error('Seleccioná hasta 366 días por consulta.');
  // Si se incluye hoy, comparar hasta el mismo horario del día equivalente anterior.
  const end=Math.min(endDay+DAY,clock+1),previousStart=start-days*DAY,previousEnd=previousStart+(end-start);
  return {start,end,previousStart,previousEnd,days,from,to,custom:true};
 }
 const days=[7,30,90].includes(Number(periodDays))?Number(periodDays):30;
 const start=last-(days-1)*DAY,end=clock+1,previousStart=start-days*DAY;
 return {start,end,previousStart,previousEnd:previousStart+(end-start),days,from:argentinaDate(start),to:today,custom:false};
}
export function argentinaCalendarDay(value){
 const n=dayStart(argentinaDate(value));
 const d=new Date(n-OFFSET);
 return {start:n,weekday:d.getUTCDay(),label:d.getUTCDate()+'/'+(d.getUTCMonth()+1)};
}
