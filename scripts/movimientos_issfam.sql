-- Casilla "+ ISSFAM" del tipo de crédito Banjercito (cofinanciamiento ISSFAM-Banjercito).
alter table public.movimientos add column if not exists tiene_issfam boolean not null default false;
