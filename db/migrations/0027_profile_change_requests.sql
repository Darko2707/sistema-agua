-- Paso 5: solo una solicitud de cambio pendiente por perfil.
CREATE UNIQUE INDEX "uq_solicitudes_cambio_perfil_pendiente"
  ON "solicitudes_cambio_perfil" ("perfil_id")
  WHERE "estado" = 'pendiente';
