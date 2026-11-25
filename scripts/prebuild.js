const fs = require('fs');
const path = require('path');

function mirror(src, targets) {
  if (!fs.existsSync(src)) return;
  const entries = fs.readdirSync(src, { withFileTypes: true, recursive: true });
  for (const e of entries) {
    if (e.isDirectory()) {
      const dir = e.parentPath || e.path || '';
      const rel = path.relative(src, path.join(dir, e.name));
      for (const t of targets) {
        fs.mkdirSync(path.join(t, rel), { recursive: true });
      }
    }
  }
}

// 1. Mirror directory structure
mirror('app', ['.next/server/app', '.next/types/app']);

// 2. Pre-create known Next.js 16 segments folders
const segmentRoots = ['.next/server/app'];
const specialSegments = [
  '_global-error.segments/_global-error',
  'error.segments/error',
  'not-found.segments/not-found',
  'page.segments/page',
  'mantenimiento.segments/mantenimiento',
  'cookies.segments/cookies',
  'privacidad.segments/privacidad',
  'terminos.segments/terminos',
  'login.segments/login',
  'registro.segments/registro',
  'reset-password.segments/reset-password',
  'admin.segments/admin',
  'admin/asignaciones.segments/asignaciones',
  'admin/donativos.segments/donativos',
  'admin/fraccionamientos.segments/fraccionamientos',
  'admin/representantes.segments/representantes',
  'admin/servicios.segments/servicios',
  'representante.segments/representante',
  'representante/reportes.segments/reportes',
  'representante/solicitudes.segments/solicitudes',
  'residente.segments/residente',
  'residente/folios.segments/folios',
  'residente/perfil.segments/perfil',
  'residente/servicios.segments/servicios',
  'tesorera.segments/tesorera',
  'tesorera/reportes.segments/reportes',
  'trabajador.segments/trabajador',
  'verificar/[folio].segments/[folio]',
  '(admin)/admin.segments/admin',
  '(admin)/admin/asignaciones.segments/asignaciones',
  '(admin)/admin/donativos.segments/donativos',
  '(admin)/admin/fraccionamientos.segments/fraccionamientos',
  '(admin)/admin/representantes.segments/representantes',
  '(admin)/admin/servicios.segments/servicios',
  '(auth)/login.segments/login',
  '(auth)/registro.segments/registro',
  '(auth)/reset-password.segments/reset-password',
  '(legal)/cookies.segments/cookies',
  '(legal)/privacidad.segments/privacidad',
  '(legal)/terminos.segments/terminos',
  '(representante)/representante.segments/representante',
  '(representante)/representante/reportes.segments/reportes',
  '(representante)/representante/solicitudes.segments/solicitudes',
  '(residente)/residente.segments/residente',
  '(residente)/residente/folios.segments/folios',
  '(residente)/residente/perfil.segments/perfil',
  '(residente)/residente/servicios.segments/servicios',
  '(tesorera)/tesorera.segments/tesorera',
  '(tesorera)/tesorera/reportes.segments/reportes',
  '(trabajador)/trabajador.segments/trabajador',
];

for (const root of segmentRoots) {
  for (const seg of specialSegments) {
    fs.mkdirSync(path.join(root, seg), { recursive: true });
  }
}
