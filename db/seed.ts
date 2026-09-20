import { db } from './index'
import { circuitos, fraccionamientos } from './schema'

const DEFAULT_FRACCIONAMIENTO_ID = '00000000-0000-4000-8000-000000000004'

async function seed() {
  await db.insert(fraccionamientos).values({
    id: DEFAULT_FRACCIONAMIENTO_ID,
    nombre: 'Fraccionamiento 4 Soles',
    slug: '4-soles',
  }).onConflictDoNothing()

  const nombres = [
    'Circuito Interior Xalapa',
    'Coatzacoalcos',
    'Córdoba',
    'Orizaba',
    'Minatitlán',
  ]

  for (const nombre of nombres) {
    await db.insert(circuitos).values({ nombre, fraccionamientoId: DEFAULT_FRACCIONAMIENTO_ID })
  }

  console.log('Circuitos creados ✓')
}

seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
