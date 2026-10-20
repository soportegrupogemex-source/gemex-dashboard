import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

// Token de la sesión iniciada: las funciones de servidor (crear-usuario) lo exigen
// para saber quién las llama.
export const tokenSesion = async () => (await supabase.auth.getSession()).data.session?.access_token || ''
