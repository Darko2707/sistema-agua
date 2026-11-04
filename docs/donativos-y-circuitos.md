# Donativos y segmentación territorial

## Regla vigente

En el esquema activo de SISCO, `fraccionamientos` es la entidad de tenant. Los
perfiles de residentes se relacionan con un fraccionamiento y almacenan su
ubicación como edificio y departamento. No existe una entidad o columna activa
`circuito_id` ni una relación de subdivisión que permita separar viviendas de un
mismo fraccionamiento por circuito.

Por ello, el módulo de donativos limita la operación al fraccionamiento elegido
por el administrador global. En la interfaz, la etiqueta «Fraccionamiento /
circuito» refleja que los datos migrados representan cada circuito como un
fraccionamiento independiente; no permite seleccionar un circuito interno ni
una subdivisión. No debe interpretarse como autorización para aplicar un
donativo a un subconjunto de viviendas dentro de un fraccionamiento.

## Alcance funcional actual

- Se pueden previsualizar las viviendas elegibles y los importes por periodo.
- Se pueden generar cargos para uno o varios meses dentro del fraccionamiento.
- Se bloquean duplicados para una vivienda, concepto y periodo, dentro de una
  transacción.
- No se admite selección de circuito o subdivisión interna porque el modelo no
  contiene esa relación.

## Cambio requerido para circuitos internos

Antes de habilitar cargos selectivos dentro de un fraccionamiento, el producto
debe definir la pertenencia territorial (por ejemplo, catálogo de circuitos y
relación persistida con cada perfil/vivienda), su aislamiento multi-tenant,
permisos y reglas para viviendas sin circuito. La migración y consultas de
donativos deberán usar esa relación; no se debe inferir el circuito desde
texto libre de edificio/departamento ni desde un identificador enviado por el
navegador.
