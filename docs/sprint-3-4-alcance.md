# Alcance de Sprint 3 y backlog de Sprint 4

## Sprint 3: donativos

En esta versión, los donativos operan a nivel de fraccionamiento (tenant). El modelo de datos disponible no representa circuitos internos vinculados a viviendas, por lo que el alcance de Sprint 3 no debe interpretarse como segmentación por circuito dentro de un fraccionamiento. La generación debe seguir limitada al fraccionamiento seleccionado y aplicar sus filtros actuales de tenant.

## Sprint 4: modelado territorial

### Historia: segmentar cargos por circuito

Agregar la tabla/entidad `circuitos` vinculada a `viviendas` para permitir donativos segmentados por manzana/circuito.

Antes de implementar esta historia, definir la relación entre `viviendas`, los perfiles residenciales existentes y la subdivisión/fraccionamiento. La entidad nueva deberá conservar el aislamiento multi-tenant y permitir identificar sin ambigüedad las viviendas elegibles de un circuito.
