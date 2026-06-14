import { db } from './index'
import { circuitos } from './schema'

async function seed() {
  const nombres = [
    'Circuito Interior Xalapa',
    'Coatzacoalcos',
    'Córdoba',
    'Orizaba',
    'Minatitlán',
  ]

  for (const nombre of nombres) {
    await db.insert(circuitos).values({ nombre })
  }

  console.log('Circuitos creados ✓')
}

seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })