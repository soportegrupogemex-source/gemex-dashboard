-- REQUISICIONES ligadas al Programa nuevo (dos tipos)
--  1) Pedido de materiales (req_materiales): lo pide Construcción para poder ejecutar (todas las categorías).
--  2) Requisición de pago (obra_requisiciones): la hace Compras después de cotizar.
--     - Dentro del presupuesto de cada partida: no necesita autorización, pasa directo a "por pagar" (Tesorería).
--     - Si rebasa el presupuesto de alguna partida: queda "por autorizar" y necesita la autorización de un
--       Super Admin Y del Gerente de Construcción; al autorizarse sube el presupuesto de esa partida (y de la etapa).
-- Rol nuevo: Compras. Compras da de alta los proveedores y los asigna a las partidas; la requisición de pago se hace a un proveedor.

-- Proveedores (los carga Compras)
create table if not exists public.obra_proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  rfc text, contacto text, telefono text, correo text, notas text,
  activo boolean not null default true,
  creado_por text,
  created_at timestamptz not null default now()
);
create unique index if not exists obra_proveedores_nombre_uk on public.obra_proveedores (lower(trim(nombre)));
alter table public.obra_proveedores enable row level security;
create policy "obra_proveedores lectura" on public.obra_proveedores for select to authenticated using (true);
create policy "obra_proveedores alta" on public.obra_proveedores for insert to authenticated with check (obra_puede('construccion.solicitar_requisiciones'));
create policy "obra_proveedores cambio" on public.obra_proveedores for update to authenticated using (obra_puede('construccion.solicitar_requisiciones')) with check (obra_puede('construccion.solicitar_requisiciones'));
create policy "obra_proveedores baja" on public.obra_proveedores for delete to authenticated using (obra_puede('construccion.solicitar_requisiciones'));
alter table public.prog_partidas add column if not exists proveedor_id uuid references public.obra_proveedores(id);
alter table public.obra_requisiciones add column if not exists proveedor_id uuid references public.obra_proveedores(id);

-- Solo Compras (o Dirección) asigna proveedor a una partida
create or replace function public.prog_partidas_proveedor_guard() returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT' and new.proveedor_id is not null) or (tg_op = 'UPDATE' and new.proveedor_id is distinct from old.proveedor_id) then
    if not obra_puede('construccion.solicitar_requisiciones') then raise exception 'Solo Compras asigna proveedores a las partidas' using errcode = '42501'; end if;
  end if;
  return new;
end $$;
drop trigger if exists prog_partidas_proveedor_trg on public.prog_partidas;
create trigger prog_partidas_proveedor_trg before insert or update of proveedor_id on public.prog_partidas for each row execute function public.prog_partidas_proveedor_guard();

create or replace function public.prog_asignar_proveedor(p_partidas uuid[], p_proveedor uuid)
 returns integer language plpgsql security definer set search_path to 'public'
as $$
declare n integer;
begin
  if not obra_puede('construccion.solicitar_requisiciones') then raise exception 'Solo Compras asigna proveedores a las partidas' using errcode = '42501'; end if;
  if p_proveedor is not null and not exists (select 1 from obra_proveedores where id = p_proveedor and activo) then raise exception 'El proveedor no existe o está inactivo'; end if;
  update prog_partidas set proveedor_id = p_proveedor where id = any (p_partidas);
  get diagnostics n = row_count;
  return n;
end $$;

-- Permisos
create or replace function public.obra_puede(p_permiso text)
 returns boolean language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_email text := lower(coalesce(auth.email(), '')); v_rol text; v_rolp text; v_def text[]; v_ov boolean;
begin
  if auth.role() is distinct from 'authenticated' or v_email = '' then return true; end if;
  select rol, rol_personalizado into v_rol, v_rolp from agentes where lower(correo) = v_email and coalesce(activo, true) limit 1;
  if v_rol is null then return false; end if;
  if v_rol = 'Super Admin' then return true; end if;
  select habilitado into v_ov from permisos_rol where rol = coalesce(nullif(v_rolp, ''), v_rol) and permiso = 'accion.' || p_permiso limit 1;
  if found then return v_ov; end if;
  v_def := case p_permiso
    when 'construccion.fijar_tope_obra' then array['Admin']
    when 'construccion.editar_costos_obra' then array['Admin', 'Sub Admin', 'Construcción', 'Gerente de Construcción']
    when 'construccion.registrar_pagos_obra' then array['Admin', 'Tesorería']
    when 'construccion.autorizar_estimaciones_obra' then array['Admin']
    when 'construccion.capturar_avance_obra' then array['Admin', 'Sub Admin', 'Construcción', 'Gerente de Construcción']
    when 'construccion.editar_obra' then array['Admin', 'Sub Admin', 'Construcción', 'Gerente de Construcción']
    when 'construccion.solicitar_requisiciones' then array['Admin', 'Sub Admin', 'Compras']
    when 'construccion.autorizar_requisiciones' then array['Admin']
    when 'construccion.req_materiales_solicitar' then array['Admin', 'Sub Admin', 'Construcción', 'Gerente de Construcción']
    when 'construccion.req_autorizar_rebasa' then array['Gerente de Construcción']
    when 'construccion.programa_cargar' then array['Admin', 'Sub Admin', 'Construcción', 'Gerente de Construcción']
    when 'construccion.programa_ejecucion' then array['Admin', 'Sub Admin', 'Construcción', 'Gerente de Construcción']
    when 'construccion.programa_abrir_etapa' then array['Admin', 'Sub Admin', 'Construcción', 'Gerente de Construcción']
    when 'construccion.programa_ampliar_solicitar' then array['Admin', 'Sub Admin', 'Construcción', 'Gerente de Construcción']
    when 'construccion.programa_ampliar_autorizar' then array['Gerente de Construcción']
    else array[]::text[] end;
  return v_rol = any (v_def);
end $function$;

-- Cargos de requisición ligados a partidas del Programa
alter table public.obra_requisicion_cargos alter column torre_id drop not null;
alter table public.obra_requisicion_cargos add column if not exists frente_id uuid references public.prog_frentes(id);
alter table public.obra_requisicion_cargos add column if not exists prog_partida_id uuid references public.prog_partidas(id);
alter table public.obra_requisicion_cargos drop constraint if exists obra_requisicion_cargos_check;
alter table public.obra_requisicion_cargos add constraint obra_requisicion_cargos_check
  check ((concepto_id is not null)::int + (contrato_id is not null)::int + (prog_partida_id is not null)::int = 1);
alter table public.obra_requisicion_cargos add constraint obra_requisicion_cargos_destino_check
  check ((prog_partida_id is not null and frente_id is not null) or (prog_partida_id is null and torre_id is not null));
create index if not exists obra_requisicion_cargos_partida_idx on public.obra_requisicion_cargos (prog_partida_id);

-- Presupuesto de una partida = cantidad x precio + lo que se le haya autorizado de más
alter table public.prog_partidas add column if not exists ampliado numeric not null default 0 check (ampliado >= 0);

create or replace function public.prog_etapa_presupuesto(p_etapa uuid)
 returns numeric language sql stable security definer set search_path to 'public'
as $$ select coalesce(sum(cantidad * precio + ampliado), 0) from prog_partidas where etapa_id = p_etapa $$;

-- Nadie cambia "ampliado" a mano: solo la autorización de una requisición que rebasa
create or replace function public.prog_partidas_ampliado_guard() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('prog.permitir_ampliado', true), '') <> '1' then
    if tg_op = 'INSERT' and new.ampliado <> 0 then raise exception 'El presupuesto extra de una partida solo lo autoriza una requisición que rebasa' using errcode = '42501'; end if;
    if tg_op = 'UPDATE' and new.ampliado is distinct from old.ampliado then raise exception 'El presupuesto extra de una partida solo lo autoriza una requisición que rebasa' using errcode = '42501'; end if;
  end if;
  return new;
end $$;
drop trigger if exists prog_partidas_ampliado_trg on public.prog_partidas;
create trigger prog_partidas_ampliado_trg before insert or update of ampliado on public.prog_partidas for each row execute function public.prog_partidas_ampliado_guard();

create or replace function public.prog_partida_presupuesto(p_partida uuid)
 returns numeric language sql stable security definer set search_path to 'public'
as $$ select coalesce((select cantidad * precio + ampliado from prog_partidas where id = p_partida), 0) $$;
create or replace function public.prog_partida_comprometido(p_partida uuid)
 returns numeric language sql stable security definer set search_path to 'public'
as $$
  select coalesce(sum(k.monto), 0) from obra_requisicion_cargos k join obra_requisiciones r on r.id = k.requisicion_id
  where k.prog_partida_id = p_partida and r.estatus in ('solicitada', 'autorizada', 'pagada')
$$;

-- Pedidos de materiales
create table if not exists public.req_materiales (
  id uuid primary key default gen_random_uuid(),
  folio integer generated always as identity,
  fecha date not null default current_date,
  frente_id uuid not null references public.prog_frentes(id),
  etapa_id uuid not null references public.prog_etapas(id),
  solicitante text,
  notas text,
  estatus text not null default 'solicitada' check (estatus in ('solicitada', 'en_compra', 'surtida', 'cancelada')),
  created_at timestamptz not null default now()
);
create table if not exists public.req_materiales_lineas (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.req_materiales(id) on delete cascade,
  partida_id uuid not null references public.prog_partidas(id),
  cantidad numeric not null check (cantidad > 0),
  nota text
);
alter table public.req_materiales enable row level security;
alter table public.req_materiales_lineas enable row level security;
create policy "req_materiales lectura" on public.req_materiales for select to authenticated using (true);
create policy "req_materiales_lineas lectura" on public.req_materiales_lineas for select to authenticated using (true);

-- Requisición de pago: columnas nuevas
alter table public.obra_requisiciones add column if not exists rebasa boolean not null default false;
alter table public.obra_requisiciones add column if not exists rebasa_detalle jsonb;
alter table public.obra_requisiciones add column if not exists aut_gerente_por text;
alter table public.obra_requisiciones add column if not exists aut_gerente_en timestamptz;
alter table public.obra_requisiciones add column if not exists aut_super_por text;
alter table public.obra_requisiciones add column if not exists aut_super_en timestamptz;
alter table public.obra_requisiciones add column if not exists pedido_id uuid references public.req_materiales(id);
alter table public.obra_requisicion_lineas add column if not exists prog_partida_id uuid references public.prog_partidas(id);


-- Crear pedido de materiales
create or replace function public.req_materiales_crear(p_etapa uuid, p_notas text, p_lineas jsonb)
 returns req_materiales language plpgsql security definer set search_path to 'public'
as $$
declare e public.prog_etapas; x jsonb; p public.req_materiales;
begin
  if not obra_puede('construccion.req_materiales_solicitar') then raise exception 'No tienes permiso para pedir materiales' using errcode = '42501'; end if;
  select * into e from prog_etapas where id = p_etapa;
  if e.id is null then raise exception 'La etapa no existe'; end if;
  if e.estatus <> 'abierta' then raise exception 'La etapa % no está abierta: se abre en Programa cuando su presupuesto está listo', e.nombre; end if;
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then raise exception 'Agrega al menos una partida al pedido'; end if;
  for x in select * from jsonb_array_elements(p_lineas) loop
    if coalesce((x->>'cantidad')::numeric, 0) <= 0 then raise exception 'Cada partida necesita una cantidad mayor a cero'; end if;
    if not exists (select 1 from prog_partidas where id = (x->>'partida_id')::uuid and etapa_id = p_etapa) then raise exception 'Una de las partidas no pertenece a la etapa %', e.nombre; end if;
  end loop;
  insert into req_materiales (frente_id, etapa_id, solicitante, notas) values (e.frente_id, e.id, auth.email(), nullif(trim(p_notas), '')) returning * into p;
  insert into req_materiales_lineas (pedido_id, partida_id, cantidad, nota)
  select p.id, (l->>'partida_id')::uuid, (l->>'cantidad')::numeric, nullif(trim(l->>'nota'), '') from jsonb_array_elements(p_lineas) l;
  return p;
end $$;

create or replace function public.req_materiales_estatus(p_id uuid, p_estatus text)
 returns req_materiales language plpgsql security definer set search_path to 'public'
as $$
declare p public.req_materiales;
begin
  select * into p from req_materiales where id = p_id for update;
  if p.id is null then raise exception 'El pedido no existe'; end if;
  if p_estatus = 'surtida' then
    if not obra_puede('construccion.solicitar_requisiciones') then raise exception 'Solo Compras marca un pedido como surtido' using errcode = '42501'; end if;
    if p.estatus not in ('solicitada', 'en_compra') then raise exception 'El pedido ya está %', p.estatus; end if;
  elsif p_estatus = 'cancelada' then
    if lower(coalesce(p.solicitante, '')) <> lower(coalesce(auth.email(), '')) and not obra_puede('construccion.solicitar_requisiciones') then raise exception 'Solo quien lo pidió (o Compras) lo cancela' using errcode = '42501'; end if;
    if p.estatus <> 'solicitada' then raise exception 'Un pedido que ya está en compra o surtido no se cancela'; end if;
  else raise exception 'Estatus no válido'; end if;
  update req_materiales set estatus = p_estatus where id = p_id returning * into p;
  return p;
end $$;

-- Crear requisición de pago (la hace Compras). Cada línea y cada parte del reparto va a una partida del Programa.
create or replace function public.obra_crear_requisicion(p_cab jsonb, p_lineas jsonb, p_cargos jsonb)
 returns obra_requisiciones language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_id uuid := gen_random_uuid(); v_des uuid := (p_cab->>'desarrollo_id')::uuid; v_fiscal boolean := coalesce((p_cab->>'fiscal')::boolean, false);
  v_ped uuid := nullif(p_cab->>'pedido_id', '')::uuid; v_prov uuid := nullif(p_cab->>'proveedor_id', '')::uuid; v_razon text;
  v_sub numeric; v_iva numeric; v_tot numeric; v_cargos numeric; x jsonb; v_orden int := 0; v_fila public.obra_requisiciones;
  r record; pa public.prog_partidas; et public.prog_etapas; pf public.prog_frentes;
  v_comp numeric; v_pres numeric; v_rebasa boolean := false; v_det jsonb := '[]'::jsonb;
begin
  if not obra_puede('construccion.solicitar_requisiciones') then raise exception 'No tienes permiso para crear requisiciones de pago' using errcode = '42501'; end if;
  if v_des is null or not exists (select 1 from desarrollos where id = v_des) then raise exception 'Elige el proyecto'; end if;
  select nombre into v_razon from obra_proveedores where id = v_prov and activo;
  if v_razon is null then raise exception 'Elige el proveedor (Compras lo da de alta en Proveedores)'; end if;
  if coalesce(trim(p_cab->>'concepto'), '') = '' then raise exception 'Falta el concepto'; end if;
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then raise exception 'Agrega al menos una línea'; end if;
  if p_cargos is null or jsonb_array_length(p_cargos) = 0 then raise exception 'Indica a qué partida se carga el pago'; end if;
  select coalesce(sum(round((l->>'cantidad')::numeric * (l->>'precio_unitario')::numeric, 2)), 0) into v_sub from jsonb_array_elements(p_lineas) l;
  if v_sub <= 0 then raise exception 'El importe de la requisición debe ser mayor a cero'; end if;
  v_iva := case when v_fiscal then round(v_sub * 0.16, 2) else 0 end;
  v_tot := v_sub + v_iva;
  select coalesce(sum((c->>'monto')::numeric), 0) into v_cargos from jsonb_array_elements(p_cargos) c;
  if abs(v_cargos - v_tot) > 0.01 then
    raise exception 'El reparto entre partidas ($%) no coincide con el total de la requisición ($%)', to_char(v_cargos, 'FM999,999,990.00'), to_char(v_tot, 'FM999,999,990.00');
  end if;
  if v_ped is not null and not exists (select 1 from req_materiales where id = v_ped and estatus in ('solicitada', 'en_compra')) then raise exception 'El pedido de materiales no existe o ya no está abierto'; end if;

  -- destinos válidos y detección de lo que rebasa el presupuesto de cada partida
  for r in select (c->>'partida_id')::uuid pid, sum((c->>'monto')::numeric) monto from jsonb_array_elements(p_cargos) c group by 1 loop
    if r.pid is null then raise exception 'Cada parte del reparto necesita una partida'; end if;
    if r.monto <= 0 then raise exception 'Cada parte del reparto debe ser mayor a cero'; end if;
    select * into pa from prog_partidas where id = r.pid;
    if pa.id is null then raise exception 'Una de las partidas no existe'; end if;
    select * into et from prog_etapas where id = pa.etapa_id;
    select * into pf from prog_frentes where id = et.frente_id;
    if pf.desarrollo_id is distinct from v_des then raise exception 'Una de las partidas no pertenece al proyecto elegido'; end if;
    if et.estatus <> 'abierta' then raise exception 'La etapa % no está abierta: primero se carga su presupuesto y se abre en Programa', et.nombre using errcode = '23514'; end if;
    v_comp := prog_partida_comprometido(pa.id); v_pres := prog_partida_presupuesto(pa.id);
    if v_comp + r.monto > v_pres + 0.005 then
      v_rebasa := true;
      v_det := v_det || jsonb_build_array(jsonb_build_object('partida_id', pa.id, 'descripcion', pa.descripcion, 'etapa', et.nombre, 'presupuesto', v_pres, 'comprometido', v_comp, 'solicitado', r.monto, 'exceso', round(v_comp + r.monto - v_pres, 2)));
    end if;
  end loop;

  insert into obra_requisiciones (id, fecha, semana, periodo, categoria, etapa, ubicacion, desarrollo_id, fiscal, factura, forma_pago, concepto, razon_social, solicitante, observaciones, subtotal, iva, total,
                                  estatus, autorizada_por, autorizada_en, rebasa, rebasa_detalle, pedido_id, proveedor_id)
  values (v_id, coalesce(nullif(p_cab->>'fecha', '')::date, current_date), nullif(p_cab->>'semana', '')::int, nullif(trim(p_cab->>'periodo'), ''),
          coalesce(nullif(p_cab->>'categoria', ''), 'edificacion'), nullif(trim(p_cab->>'etapa'), ''), nullif(trim(p_cab->>'ubicacion'), ''), v_des, v_fiscal,
          nullif(trim(p_cab->>'factura'), ''), nullif(p_cab->>'forma_pago', ''), trim(p_cab->>'concepto'), v_razon, auth.email(),
          nullif(trim(p_cab->>'observaciones'), ''), v_sub, v_iva, v_tot,
          case when v_rebasa then 'solicitada' else 'autorizada' end, case when v_rebasa then null else 'Dentro de presupuesto' end, case when v_rebasa then null else now() end,
          v_rebasa, case when v_rebasa then v_det else null end, v_ped, v_prov);
  for x in select * from jsonb_array_elements(p_lineas) loop
    v_orden := v_orden + 1;
    insert into obra_requisicion_lineas (requisicion_id, orden, partida, referencia, concepto, cantidad, unidad, precio_unitario, importe, prog_partida_id)
    values (v_id, v_orden, nullif(trim(x->>'partida'), ''), nullif(trim(x->>'referencia'), ''), nullif(trim(x->>'concepto'), ''), (x->>'cantidad')::numeric,
            nullif(trim(x->>'unidad'), ''), (x->>'precio_unitario')::numeric, round((x->>'cantidad')::numeric * (x->>'precio_unitario')::numeric, 2), nullif(x->>'partida_id', '')::uuid);
  end loop;
  for x in select * from jsonb_array_elements(p_cargos) loop
    insert into obra_requisicion_cargos (requisicion_id, frente_id, monto, prog_partida_id)
    select v_id, e.frente_id, (x->>'monto')::numeric, pa2.id from prog_partidas pa2 join prog_etapas e on e.id = pa2.etapa_id where pa2.id = (x->>'partida_id')::uuid;
  end loop;
  if v_ped is not null then update req_materiales set estatus = 'en_compra' where id = v_ped and estatus = 'solicitada'; end if;
  select * into v_fila from obra_requisiciones where id = v_id;
  return v_fila;
end $function$;

-- Autorizar (o rechazar) una requisición que rebasa el presupuesto: un Super Admin Y el Gerente de Construcción
create or replace function public.req_autorizar_rebasa(p_id uuid, p_autorizar boolean, p_motivo text)
 returns obra_requisiciones language plpgsql security definer set search_path to 'public'
as $$
declare q public.obra_requisiciones; v_rol text; v_lado text; r record; v_exc numeric;
begin
  if not obra_puede('construccion.req_autorizar_rebasa') then raise exception 'Solo un Super Admin o el Gerente de Construcción autorizan lo que rebasa el presupuesto' using errcode = '42501'; end if;
  select rol into v_rol from agentes where lower(correo) = lower(coalesce(auth.email(), '')) and coalesce(activo, true) limit 1;
  v_lado := case when v_rol = 'Super Admin' then 'super' else 'gerente' end;
  select * into q from obra_requisiciones where id = p_id for update;
  if q.id is null then raise exception 'La requisición no existe'; end if;
  if q.estatus <> 'solicitada' or not q.rebasa then raise exception 'Esta requisición no está esperando autorización'; end if;
  if not p_autorizar then
    if coalesce(trim(p_motivo), '') = '' then raise exception 'Escribe el motivo del rechazo'; end if;
    update obra_requisiciones set estatus = 'rechazada', autorizada_por = auth.email(), autorizada_en = now(), rechazo_motivo = trim(p_motivo) where id = p_id returning * into q;
    return q;
  end if;
  if v_lado = 'super' then
    if q.aut_super_por is not null then raise exception 'Un Super Admin ya autorizó esta requisición: falta el Gerente de Construcción'; end if;
    update obra_requisiciones set aut_super_por = auth.email(), aut_super_en = now() where id = p_id returning * into q;
  else
    if q.aut_gerente_por is not null then raise exception 'El Gerente de Construcción ya autorizó esta requisición: falta un Super Admin'; end if;
    update obra_requisiciones set aut_gerente_por = auth.email(), aut_gerente_en = now() where id = p_id returning * into q;
  end if;
  if q.aut_super_por is not null and q.aut_gerente_por is not null then
    perform set_config('prog.permitir_ampliado', '1', true);
    for r in select distinct prog_partida_id pid from obra_requisicion_cargos where requisicion_id = p_id and prog_partida_id is not null loop
      v_exc := prog_partida_comprometido(r.pid) - prog_partida_presupuesto(r.pid);
      if v_exc > 0.005 then
        update prog_partidas set ampliado = ampliado + round(v_exc, 2) where id = r.pid;
        insert into prog_ampliaciones (etapa_id, monto, motivo, estatus, solicitada_por, resuelta_por, resuelta_en, nota_resolucion)
        select pa.etapa_id, round(v_exc, 2), 'Requisición #' || q.folio || ' rebasa la partida ' || pa.descripcion, 'autorizada', q.solicitante, auth.email(), now(), 'Autorizada por un Super Admin y el Gerente de Construcción'
        from prog_partidas pa where pa.id = r.pid;
      end if;
    end loop;
    update obra_requisiciones set estatus = 'autorizada', autorizada_por = q.aut_gerente_por || ' y ' || q.aut_super_por, autorizada_en = now() where id = p_id returning * into q;
  end if;
  return q;
end $$;

-- Pagar: lo pagado en el Programa se calcula de la requisición pagada
create or replace function public.obra_pagar_requisicion(p_id uuid, p_fecha date, p_comprobante text)
 returns obra_requisiciones language plpgsql security definer set search_path to 'public'
as $function$
declare r public.obra_requisiciones; c record; v_gid uuid; v_pid uuid; v_txt text;
begin
  if not obra_puede('construccion.registrar_pagos_obra') then raise exception 'No tienes permiso para registrar pagos'; end if;
  if coalesce(trim(p_comprobante), '') = '' then raise exception 'Sube el comprobante de pago'; end if;
  select * into r from obra_requisiciones where id = p_id for update;
  if r.id is null then raise exception 'La requisición no existe'; end if;
  if r.estatus <> 'autorizada' then raise exception 'Solo se paga una requisición autorizada (estatus actual: %)', r.estatus; end if;
  v_txt := 'Requisición #' || r.folio || ' · ' || r.razon_social;
  for c in select * from obra_requisicion_cargos where requisicion_id = p_id loop
    if c.prog_partida_id is not null then
      null;
    elsif c.concepto_id is not null then
      insert into obra_gastos (concepto_id, fecha, monto, descripcion, origen, requisicion_id, registrado_por)
        values (c.concepto_id, coalesce(p_fecha, current_date), c.monto, v_txt, 'requisicion', p_id, auth.email()) returning id into v_gid;
      update obra_requisicion_cargos set gasto_id = v_gid where id = c.id;
    else
      insert into obra_pagos (contrato_id, fecha, monto, concepto, comprobante_path, registrado_por)
        values (c.contrato_id, coalesce(p_fecha, current_date), c.monto, v_txt, p_comprobante, auth.email()) returning id into v_pid;
      update obra_requisicion_cargos set pago_id = v_pid where id = c.id;
    end if;
  end loop;
  update obra_requisiciones set estatus = 'pagada', pagada_por = auth.email(), pagada_en = now(), fecha_pago = coalesce(p_fecha, current_date), comprobante_path = trim(p_comprobante)
    where id = p_id returning * into r;
  return r;
end $function$;

-- Eliminar: quien la hizo o Dirección, mientras no esté pagada
create or replace function public.obra_eliminar_requisicion(p_id uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare r public.obra_requisiciones;
begin
  select * into r from obra_requisiciones where id = p_id;
  if r.id is null then raise exception 'La requisición no existe'; end if;
  if r.estatus = 'pagada' then raise exception 'Una requisición pagada no se puede eliminar'; end if;
  if lower(coalesce(r.solicitante, '')) <> lower(coalesce(auth.email(), '')) and not obra_puede('construccion.autorizar_requisiciones') then
    raise exception 'Solo quien la hizo (o Dirección) puede eliminarla';
  end if;
  delete from obra_requisiciones where id = p_id;
  if r.pedido_id is not null and not exists (select 1 from obra_requisiciones where pedido_id = r.pedido_id) then
    update req_materiales set estatus = 'solicitada' where id = r.pedido_id and estatus = 'en_compra';
  end if;
end $function$;

grant execute on function public.req_materiales_crear(uuid, text, jsonb), public.req_materiales_estatus(uuid, text), public.req_autorizar_rebasa(uuid, boolean, text),
  public.prog_partida_presupuesto(uuid), public.prog_partida_comprometido(uuid), public.prog_asignar_proveedor(uuid[], uuid) to authenticated;
