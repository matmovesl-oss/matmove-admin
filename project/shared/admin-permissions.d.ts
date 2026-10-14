
export const SECTION_GROUPS:Array<{label:string;items:Array<[string,string,string]>}>;
export const PERMISSION_KEYS:string[];
export function validPermissions(value:unknown):string[];
export function canAdminAccess(access:any,key:string):boolean;
export function homeFor(access:any):string;
