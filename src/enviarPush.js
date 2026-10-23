// FIX: helper compartido — llama al Edge Function "enviar-push" que manda
// la notificación real al teléfono de cada correo en la lista. Nunca
// bloquea ni rompe el flujo principal si falla (el aviso es un plus, no
// algo de lo que dependa la acción que se está haciendo).
import { tokenSesion } from './supabase';

const PUSH_FUNCTIONS_URL = `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/enviar-push`;
const PUSH_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;

export async function enviarPush({ correos, title, body, url, badgeCount }) {
  if (!correos || correos.length === 0) return;
  try {
    await fetch(PUSH_FUNCTIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // La función exige la sesión de quien notifica (la clave pública ya no basta).
        'Authorization': `Bearer ${(await tokenSesion()) || PUSH_ANON_KEY}`,
        'apikey': PUSH_ANON_KEY,
      },
      body: JSON.stringify({ correos, title, body, url, badgeCount }),
    });
  } catch (err) {
    // silencioso a propósito — un push fallido no debe romper el flujo principal
  }
}
