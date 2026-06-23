import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

export const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID!}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export const R2_BUCKET = process.env.R2_BUCKET_NAME ?? 'tickets-agua';

/** Descarga un objeto de R2. Retorna null si no existe; lanza en cualquier otro error. */
export async function r2Get(key: string): Promise<Buffer | null> {
  try {
    const { Body } = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    if (!Body) return null;
    const chunks: Uint8Array[] = [];
    for await (const chunk of Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch (err: unknown) {
    const code = (err as { Code?: string; name?: string }).Code ?? (err as { name?: string }).name;
    if (code === 'NoSuchKey' || code === 'NotFound') return null;
    throw err;
  }
}

/** Sube un Buffer a R2 con el Content-Type indicado. */
export async function r2Put(
  key: string,
  data: Buffer,
  contentType: string,
): Promise<void> {
  await r2.send(
    new PutObjectCommand({
      Bucket:       R2_BUCKET,
      Key:          key,
      Body:         data,
      ContentType:  contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );
}
