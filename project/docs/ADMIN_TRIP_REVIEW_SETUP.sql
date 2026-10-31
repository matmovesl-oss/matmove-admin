-- Read-only trip review for currently assigned Dispatch staff. No money/status writes.
begin;
create or replace function public.matmove_admin_trip_review(p_booking uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare actor uuid;b public.bookings%rowtype;r public.profiles%rowtype;d public.profiles%rowtype;driver_gps jsonb;customer_gps jsonb;active_trip boolean;
begin
 actor:=public.matmove_dispatch_actor();
 select * into b from public.bookings where id=p_booking;
 if not found then raise exception 'NOT_FOUND: Trip not found.';end if;
 select * into r from public.profiles where id=b.rider_id;
 select * into d from public.profiles where id=b.driver_id;
 active_trip:=b.driver_id is not null and b.status::text in ('accepted','in_progress');
 if active_trip then
  select jsonb_build_object('lat',p.latitude,'lng',p.longitude,'accuracy',p.accuracy,'observedAt',p.observed_at,'receivedAt',p.received_at) into driver_gps
  from public.matmove_trip_positions p where p.booking_id=b.id and p.driver_id=b.driver_id
  and p.received_at>clock_timestamp()-interval '45 seconds' and p.observed_at>clock_timestamp()-interval '60 seconds';
  select jsonb_build_object('lat',p.latitude,'lng',p.longitude,'accuracy',p.accuracy,'observedAt',p.observed_at,'receivedAt',p.received_at) into customer_gps
  from public.matmove_customer_trip_positions p where p.booking_id=b.id and p.customer_id=b.rider_id
  and p.received_at>clock_timestamp()-interval '45 seconds' and p.observed_at>clock_timestamp()-interval '60 seconds';
 end if;
 return jsonb_build_object('actor',actor,'bookingId',b.id,'status',b.status,'serverTime',clock_timestamp(),
 'pickup',b.pickup_location,'destination',b.destination_location,'fare',b.fare_amount::text,
 'serviceType',b.service_type,'vehicleType',to_jsonb(b)->>'vehicle_type',
 'passengerCount',coalesce(to_jsonb(b)->>'passenger_count','1'),'passengerName',to_jsonb(b)->>'passenger_name',
 'createdAt',b.created_at,'scheduledAt',to_jsonb(b)->>'scheduled_time','acceptedAt',to_jsonb(b)->>'accepted_at',
 'startedAt',to_jsonb(b)->>'started_at','completedAt',to_jsonb(b)->>'completed_at',
 'rider',jsonb_build_object('id',b.rider_id,'name',coalesce(nullif(to_jsonb(r)->>'full_name',''),to_jsonb(r)->>'email'),'email',to_jsonb(r)->>'email','phone',coalesce(nullif(to_jsonb(r)->>'phone',''),to_jsonb(r)->>'phone_number')),
 'driver',case when b.driver_id is null then null else jsonb_build_object('id',b.driver_id,'name',coalesce(nullif(to_jsonb(d)->>'full_name',''),to_jsonb(d)->>'email'),'email',to_jsonb(d)->>'email','phone',coalesce(nullif(to_jsonb(d)->>'phone',''),to_jsonb(d)->>'phone_number'),'vehicleType',to_jsonb(d)->>'vehicle_type','plate',to_jsonb(d)->>'plate_number') end,
 'pickupPin',case when b.matmove_pickup_lat is null then null else jsonb_build_object('lat',b.matmove_pickup_lat,'lng',b.matmove_pickup_lng) end,
 'destinationPin',case when b.matmove_destination_lat is null then null else jsonb_build_object('lat',b.matmove_destination_lat,'lng',b.matmove_destination_lng) end,
 'driverPosition',driver_gps,'customerPosition',customer_gps,'trackingActive',active_trip);
end;
$fn$;
revoke all on function public.matmove_admin_trip_review(uuid) from public,anon,service_role;
grant execute on function public.matmove_admin_trip_review(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
select to_regprocedure('public.matmove_admin_trip_review(uuid)') is not null as admin_trip_review_ready;
