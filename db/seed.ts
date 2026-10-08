import { db } from './index';
import { fraccionamientos } from './schema';

const DEFAULT_FRACCIONAMIENTO_ID = '00000000-0000-4000-8000-000000000004';

async function seed() {
  await db.insert(fraccionamientos).values({
    id: DEFAULT_FRACCIONAMIENTO_ID,
    nombre: 'Fraccionamiento 4 Soles',
    slug: '4-soles',
  }).onConflictDoNothing();

  console.log('Fraccionamiento de ejemplo creado');
}

seed().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
