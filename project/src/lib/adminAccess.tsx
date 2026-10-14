
import {createContext,useContext} from 'react';
import {canAdminAccess,SECTION_GROUPS,homeFor} from '../../shared/admin-permissions.js';
export {SECTION_GROUPS,homeFor};
export const sections=SECTION_GROUPS.flatMap(g=>g.items);
export type AdminAccess={id:string;email?:string;full_name?:string;department?:string;is_owner:boolean;is_active:boolean;permissions:string[];requires_password_setup?:boolean;role?:string};
export type Access=AdminAccess;
export const AdminAccessContext=createContext<AdminAccess|null>(null);
export function useAdminAccess(){return useContext(AdminAccessContext);}
export const canAccess=canAdminAccess;
