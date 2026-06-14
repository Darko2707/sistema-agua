import { supabase } from './supabase';

export async function subirPDF(folio: string, buffer: Buffer, contentType = 'application/pdf') {
  const key = `tickets/${folio}.pdf`;
  const { error } = await supabase.storage
    .from('tickets')
    .upload(key, buffer, { contentType, upsert: true });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from('tickets').getPublicUrl(key);
  return publicUrl;
}