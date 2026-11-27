export interface HallPreferences { size:number; rotate:boolean }
const KEY='online-tournament:hall-display-preferences:v1';
export function parseHallPreferences(raw:string|null):HallPreferences{
 try{const data=JSON.parse(raw??'null');return {size:[4,8,12,16].includes(data?.size)?data.size:8,rotate:data?.rotate===true};}
 catch{return {size:8,rotate:false};}
}
export function loadHallPreferences():HallPreferences{
 try{return parseHallPreferences(localStorage.getItem(KEY));}catch{return {size:8,rotate:false};}
}
export function saveHallPreferences(preferences:HallPreferences){
 try{localStorage.setItem(KEY,JSON.stringify(preferences));}catch{/* storage disabled: view remains usable */}
}
