-- PROGRAMA DE OBRA (nuevo) — replica el Excel "ARRAYANES 2 EDIF. TORRE L".
-- Un frente (Torre L) se trabaja por ETAPA (Cimentación, Planta Baja...). Cada etapa tiene partidas en 5 categorías
-- (mano de obra, materiales, subcontratos, maquinaria, indirectos) con unidad, precio y cantidad (= presupuesto),
-- y una ejecución semanal (unidades y precio real). Una etapa pasa por: presupuesto -> abierta -> cerrada.
-- Con la etapa abierta ya no se puede pasar del tope; más presupuesto = ampliación que solo autoriza el Gerente de Construcción.
-- No toca las tablas obra_* anteriores (Torre F, Indirectos, requisiciones): quedan como archivo.

create table if not exists public.prog_frentes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  desarrollo_id uuid references public.desarrollos(id),
  etapa_desarrollo text,
  lugar text,
  viviendas integer,
  fecha_arranque date,
  creado_por text,
  created_at timestamptz not null default now()
);
create table if not exists public.prog_semanas (
  id uuid primary key default gen_random_uuid(),
  frente_id uuid not null references public.prog_frentes(id) on delete cascade,
  orden numeric not null,
  etiqueta text not null,
  fecha date,
  unique (frente_id, orden)
);
create table if not exists public.prog_etapas (
  id uuid primary key default gen_random_uuid(),
  frente_id uuid not null references public.prog_frentes(id) on delete cascade,
  nombre text not null,
  orden integer not null default 0,
  estatus text not null default 'presupuesto' check (estatus in ('presupuesto', 'abierta', 'cerrada')),
  tope numeric,
  abierta_por text, abierta_en timestamptz,
  cerrada_por text, cerrada_en timestamptz,
  created_at timestamptz not null default now(),
  unique (frente_id, nombre)
);
create table if not exists public.prog_partidas (
  id uuid primary key default gen_random_uuid(),
  etapa_id uuid not null references public.prog_etapas(id) on delete cascade,
  categoria text not null check (categoria in ('mano_obra', 'materiales', 'subcontratos', 'maquinaria', 'indirectos')),
  grupo text,
  descripcion text not null,
  unidad text,
  cantidad numeric not null default 0,
  precio numeric not null default 0,
  orden integer not null default 0,
  creado_por text,
  created_at timestamptz not null default now()
);
create index if not exists prog_partidas_etapa_idx on public.prog_partidas (etapa_id);
create table if not exists public.prog_ejecucion (
  id uuid primary key default gen_random_uuid(),
  partida_id uuid not null references public.prog_partidas(id) on delete cascade,
  semana_id uuid not null references public.prog_semanas(id) on delete cascade,
  unidades numeric not null default 0,
  precio numeric,
  actualizado_por text,
  updated_at timestamptz not null default now(),
  unique (partida_id, semana_id)
);
create table if not exists public.prog_ampliaciones (
  id uuid primary key default gen_random_uuid(),
  etapa_id uuid not null references public.prog_etapas(id) on delete cascade,
  monto numeric not null check (monto > 0),
  motivo text not null,
  ejecutado_al_solicitar numeric,
  estatus text not null default 'solicitada' check (estatus in ('solicitada', 'autorizada', 'rechazada')),
  solicitada_por text, solicitada_en timestamptz not null default now(),
  resuelta_por text, resuelta_en timestamptz, nota_resolucion text
);

-- Permisos (se suman a los que ya había; Super Admin siempre puede)
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
    when 'construccion.solicitar_requisiciones' then array['Admin', 'Sub Admin', 'Construcción', 'Gerente de Construcción']
    when 'construccion.autorizar_requisiciones' then array['Admin']
    when 'construccion.programa_cargar' then array['Admin', 'Sub Admin', 'Construcción', 'Gerente de Construcción']
    when 'construccion.programa_ejecucion' then array['Admin', 'Sub Admin', 'Construcción', 'Gerente de Construcción']
    when 'construccion.programa_abrir_etapa' then array['Admin', 'Sub Admin', 'Construcción', 'Gerente de Construcción']
    when 'construccion.programa_ampliar_solicitar' then array['Admin', 'Sub Admin', 'Construcción', 'Gerente de Construcción']
    when 'construccion.programa_ampliar_autorizar' then array['Gerente de Construcción']
    else array[]::text[] end;
  return v_rol = any (v_def);
end $function$;

-- Cálculos por etapa
create or replace function public.prog_etapa_presupuesto(p_etapa uuid)
 returns numeric language sql stable security definer set search_path to 'public'
as $$ select coalesce(sum(cantidad * precio), 0) from prog_partidas where etapa_id = p_etapa $$;

create or replace function public.prog_etapa_ejecutado(p_etapa uuid)
 returns numeric language sql stable security definer set search_path to 'public'
as $$ select coalesce(sum(e.unidades * coalesce(e.precio, p.precio)), 0) from prog_ejecucion e join prog_partidas p on p.id = e.partida_id where p.etapa_id = p_etapa $$;

create or replace function public.prog_etapa_ampliado(p_etapa uuid)
 returns numeric language sql stable security definer set search_path to 'public'
as $$ select coalesce(sum(monto), 0) from prog_ampliaciones where etapa_id = p_etapa and estatus = 'autorizada' $$;

-- Candado: etapa abierta no pasa de su tope (ni en presupuesto ni en ejecución); etapa cerrada no se modifica
create or replace function public.prog_validar_etapa(p_etapa uuid, p_ejecucion boolean)
 returns void language plpgsql security definer set search_path to 'public'
as $$
declare e public.prog_etapas; v_tot numeric; v_tope numeric;
begin
  select * into e from prog_etapas where id = p_etapa;
  if e.id is null then return; end if;
  if e.estatus = 'cerrada' then raise exception 'La etapa % está cerrada: ya no se puede modificar', e.nombre using errcode = '23514'; end if;
  if e.estatus = 'presupuesto' then
    if p_ejecucion then raise exception 'La etapa % todavía no está abierta: primero se carga su presupuesto y se abre', e.nombre using errcode = '23514'; end if;
    return;
  end if;
  v_tope := coalesce(e.tope, 0) + prog_etapa_ampliado(p_etapa);
  v_tot := case when p_ejecucion then prog_etapa_ejecutado(p_etapa) else prog_etapa_presupuesto(p_etapa) end;
  if v_tot > v_tope + 0.005 then
    raise exception 'La etapa % tiene un tope de $% y con este cambio %llegaría a $%. Para más presupuesto el Gerente de Construcción debe autorizar una ampliación.',
      e.nombre, to_char(v_tope, 'FM999,999,999,990.00'), case when p_ejecucion then 'lo ejecutado ' else '' end, to_char(v_tot, 'FM999,999,999,990.00') using errcode = '23514';
  end if;
end $$;

create or replace function public.prog_partidas_ai() returns trigger language plpgsql as $$
begin perform prog_validar_etapa(new.etapa_id, false); return new; end $$;
drop trigger if exists prog_partidas_trg on public.prog_partidas;
create trigger prog_partidas_trg after insert or update of cantidad, precio, etapa_id on public.prog_partidas
  for each row execute function public.prog_partidas_ai();

create or replace function public.prog_ejecucion_ai() returns trigger language plpgsql as $$
declare v_etapa uuid;
begin
  select etapa_id into v_etapa from prog_partidas where id = new.partida_id;
  perform prog_validar_etapa(v_etapa, true);
  return new;
end $$;
drop trigger if exists prog_ejecucion_trg on public.prog_ejecucion;
create trigger prog_ejecucion_trg after insert or update of unidades, precio on public.prog_ejecucion
  for each row execute function public.prog_ejecucion_ai();

-- Seguridad de tablas
alter table public.prog_frentes enable row level security;
alter table public.prog_semanas enable row level security;
alter table public.prog_etapas enable row level security;
alter table public.prog_partidas enable row level security;
alter table public.prog_ejecucion enable row level security;
alter table public.prog_ampliaciones enable row level security;

do $$
declare t text;
begin
  foreach t in array array['prog_frentes', 'prog_semanas', 'prog_etapas', 'prog_partidas', 'prog_ejecucion', 'prog_ampliaciones'] loop
    execute format('drop policy if exists "%1$s lectura" on public.%1$s', t);
    execute format('create policy "%1$s lectura" on public.%1$s for select to authenticated using (true)', t);
  end loop;
end $$;

create policy "prog_frentes alta" on public.prog_frentes for insert to authenticated with check (obra_puede('construccion.programa_cargar'));
create policy "prog_frentes cambio" on public.prog_frentes for update to authenticated using (obra_puede('construccion.programa_cargar')) with check (obra_puede('construccion.programa_cargar'));
create policy "prog_frentes baja" on public.prog_frentes for delete to authenticated using (obra_puede('construccion.programa_cargar') and not exists (select 1 from prog_etapas e where e.frente_id = id and e.estatus <> 'presupuesto'));
create policy "prog_semanas alta" on public.prog_semanas for insert to authenticated with check (obra_puede('construccion.programa_cargar') or obra_puede('construccion.programa_ejecucion'));
create policy "prog_semanas cambio" on public.prog_semanas for update to authenticated using (obra_puede('construccion.programa_cargar')) with check (obra_puede('construccion.programa_cargar'));
create policy "prog_etapas alta" on public.prog_etapas for insert to authenticated with check (obra_puede('construccion.programa_cargar') and estatus = 'presupuesto' and tope is null);
create policy "prog_etapas baja" on public.prog_etapas for delete to authenticated using (obra_puede('construccion.programa_cargar') and estatus = 'presupuesto');
create policy "prog_partidas alta" on public.prog_partidas for insert to authenticated with check (obra_puede('construccion.programa_cargar'));
create policy "prog_partidas cambio" on public.prog_partidas for update to authenticated using (obra_puede('construccion.programa_cargar')) with check (obra_puede('construccion.programa_cargar'));
create policy "prog_partidas baja" on public.prog_partidas for delete to authenticated using (obra_puede('construccion.programa_cargar') and not exists (select 1 from prog_ejecucion x where x.partida_id = id and x.unidades <> 0));
create policy "prog_ejecucion alta" on public.prog_ejecucion for insert to authenticated with check (obra_puede('construccion.programa_ejecucion'));
create policy "prog_ejecucion cambio" on public.prog_ejecucion for update to authenticated using (obra_puede('construccion.programa_ejecucion')) with check (obra_puede('construccion.programa_ejecucion'));

-- Abrir / cerrar etapas y ampliaciones (solo por estas funciones)
create or replace function public.prog_abrir_etapa(p_etapa uuid)
 returns prog_etapas language plpgsql security definer set search_path to 'public'
as $$
declare e public.prog_etapas; v_pres numeric;
begin
  if not obra_puede('construccion.programa_abrir_etapa') then raise exception 'No tienes permiso para abrir etapas' using errcode = '42501'; end if;
  select * into e from prog_etapas where id = p_etapa for update;
  if e.id is null then raise exception 'La etapa no existe'; end if;
  if e.estatus <> 'presupuesto' then raise exception 'La etapa ya está %', e.estatus; end if;
  v_pres := prog_etapa_presupuesto(p_etapa);
  if v_pres <= 0 then raise exception 'Primero carga el presupuesto de la etapa (partidas con precio y cantidad) y luego ábrela'; end if;
  update prog_etapas set estatus = 'abierta', tope = v_pres, abierta_por = auth.email(), abierta_en = now() where id = p_etapa returning * into e;
  return e;
end $$;

create or replace function public.prog_cerrar_etapa(p_etapa uuid)
 returns prog_etapas language plpgsql security definer set search_path to 'public'
as $$
declare e public.prog_etapas;
begin
  if not obra_puede('construccion.programa_abrir_etapa') then raise exception 'No tienes permiso para cerrar etapas' using errcode = '42501'; end if;
  select * into e from prog_etapas where id = p_etapa for update;
  if e.id is null or e.estatus <> 'abierta' then raise exception 'Solo se cierra una etapa abierta'; end if;
  update prog_etapas set estatus = 'cerrada', cerrada_por = auth.email(), cerrada_en = now() where id = p_etapa returning * into e;
  return e;
end $$;

create or replace function public.prog_reabrir_etapa(p_etapa uuid)
 returns prog_etapas language plpgsql security definer set search_path to 'public'
as $$
declare e public.prog_etapas;
begin
  if not obra_puede('construccion.programa_ampliar_autorizar') then raise exception 'Solo el Gerente de Construcción puede reabrir una etapa cerrada' using errcode = '42501'; end if;
  select * into e from prog_etapas where id = p_etapa for update;
  if e.id is null or e.estatus <> 'cerrada' then raise exception 'Solo se reabre una etapa cerrada'; end if;
  update prog_etapas set estatus = 'abierta', cerrada_por = null, cerrada_en = null where id = p_etapa returning * into e;
  return e;
end $$;

create or replace function public.prog_solicitar_ampliacion(p_etapa uuid, p_monto numeric, p_motivo text)
 returns prog_ampliaciones language plpgsql security definer set search_path to 'public'
as $$
declare e public.prog_etapas; v_ej numeric; a public.prog_ampliaciones;
begin
  if not obra_puede('construccion.programa_ampliar_solicitar') then raise exception 'No tienes permiso para solicitar ampliaciones' using errcode = '42501'; end if;
  select * into e from prog_etapas where id = p_etapa;
  if e.id is null or e.estatus <> 'abierta' then raise exception 'Solo se amplía el presupuesto de una etapa abierta'; end if;
  if coalesce(p_monto, 0) <= 0 then raise exception 'El monto debe ser mayor a cero'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Escribe el motivo de la ampliación'; end if;
  if exists (select 1 from prog_ampliaciones where etapa_id = p_etapa and estatus = 'solicitada') then raise exception 'Ya hay una ampliación pendiente de autorizar en esta etapa'; end if;
  v_ej := prog_etapa_ejecutado(p_etapa);
  if v_ej <= 0 then raise exception 'La etapa todavía no tiene avance: se puede ampliar el presupuesto cuando ya hay ejecución'; end if;
  insert into prog_ampliaciones (etapa_id, monto, motivo, ejecutado_al_solicitar, solicitada_por) values (p_etapa, p_monto, trim(p_motivo), v_ej, auth.email()) returning * into a;
  return a;
end $$;

create or replace function public.prog_resolver_ampliacion(p_id uuid, p_autorizar boolean, p_nota text)
 returns prog_ampliaciones language plpgsql security definer set search_path to 'public'
as $$
declare a public.prog_ampliaciones;
begin
  if not obra_puede('construccion.programa_ampliar_autorizar') then raise exception 'Solo el Gerente de Construcción autoriza ampliaciones de presupuesto' using errcode = '42501'; end if;
  select * into a from prog_ampliaciones where id = p_id for update;
  if a.id is null then raise exception 'La ampliación no existe'; end if;
  if a.estatus <> 'solicitada' then raise exception 'Esta ampliación ya fue %', a.estatus; end if;
  update prog_ampliaciones set estatus = case when p_autorizar then 'autorizada' else 'rechazada' end, resuelta_por = auth.email(), resuelta_en = now(), nota_resolucion = nullif(trim(p_nota), '')
  where id = p_id returning * into a;
  return a;
end $$;

grant execute on function public.prog_etapa_presupuesto(uuid), public.prog_etapa_ejecutado(uuid), public.prog_etapa_ampliado(uuid),
  public.prog_abrir_etapa(uuid), public.prog_cerrar_etapa(uuid), public.prog_reabrir_etapa(uuid),
  public.prog_solicitar_ampliacion(uuid, numeric, text), public.prog_resolver_ampliacion(uuid, boolean, text) to authenticated;
