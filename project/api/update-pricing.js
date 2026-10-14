
import {requireAdmin,failure} from '../server/admin-auth.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
 try{const {client}=await requireAdmin(req,['pricing']);const {vehicle_type,min_fare,per_km_rate}=req.body||{};
 if(typeof vehicle_type!=='string'||!/^[-a-z0-9_]{1,40}$/.test(vehicle_type)||![min_fare,per_km_rate].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1000000))throw failure(400,'Enter a valid vehicle type and nonnegative prices.');
 const r=await client.from('pricing_settings').upsert({vehicle_type,min_fare,per_km_rate},{onConflict:'vehicle_type'});if(r.error)throw failure(503,'Pricing could not be saved.');return res.status(200).json({success:true});
 }catch(e){return res.status(e.status||500).json({error:e.status?e.message:'Pricing update failed.'});}
}
