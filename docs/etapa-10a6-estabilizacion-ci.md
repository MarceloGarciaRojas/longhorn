# Etapa 10A.6: estabilización de CI y cierre técnico de 10A.5

- **Proyecto interno:** Longhorn
- **Marca visible:** nexi
- **Fecha:** 2026-08-16
- **Base:** `c04a482d0e8aaa5b4f0d0400277e29b812465128`
- **Rama:** `codex/etapa-10a6-estabilizacion-ci`
- **Estado local:** CORRECCIÓN VALIDADA
- **CI técnica de la rama:** APROBADA
- **Pull Request:** #11 (MERGED)
- **Merge commit:** `e90cddc9edfbaafc52b9da4667703365b663516b`

## 1. Incidente

El workflow disparado por el merge del PR #10, run `31988199583`, aprobó
instalación, PostgreSQL, migraciones, RLS, `verify`, módulos funcionales y los
E2E anteriores. Falló en `Verify multimedia and template flows end to end`:

```text
Error: media service did not start
```

El harness había iniciado el servicio multimedia en un puerto elegido con
`43_300 + Math.random() * 200`. El proceso hijo enviaba `stdout` y `stderr` a
una cadena, pero la espera solo consultaba `/health`. No observaba el evento de
salida ni mostraba la salida capturada. Si el bind fallaba, la prueba esperaba
30 segundos y reemplazaba la causa por el error genérico observado en CI.

## 2. Diagnóstico y reproducción

La selección aleatoria no reservaba el puerto y usaba un rango incluido en el
rango efímero habitual de Linux. Existían dos estados inseguros:

1. un proceso ajeno que respondiera health podía producir un falso positivo;
2. un proceso que ocupara el puerto sin health provocaba `EADDRINUSE` en el
   hijo, pero el harness ocultaba el error y terminaba 30 segundos después.

La segunda condición se reprodujo de forma controlada ocupando el puerto
elegido y forzando la selección determinista. El resultado fue exactamente:

```text
media service did not start
```

La reproducción demuestra la vía causal del error y la pérdida de diagnóstico.
El log histórico de GitHub no permite recuperar el `stderr` original porque el
harness anterior nunca lo imprimió; por ello no se atribuye retrospectivamente
un código de error no registrado al runner.

También se comprobó que:

- Node era 24.14.0 y pnpm 11.9.0;
- el servicio iniciaba normalmente sin colisión;
- Sharp cargaba y procesaba imágenes;
- el servicio persistente del workflow usaba 43127, distinto del rango del
  hijo E2E;
- no había procesos ni listeners residuales antes de reproducir;
- working directory y variables requeridas eran correctos.

## 3. Corrección

La corrección no modifica producto, persistencia ni seguridad:

1. `MEDIA_LOCAL_SERVICE_PORT=0` delega al sistema operativo la asignación
   atómica de un puerto loopback disponible.
2. El CLI informa el puerto realmente asignado por `server.address()` después
   de que `listen` completa.
3. El harness obtiene esa dirección desde la señal de readiness del hijo y
   confirma `/health` antes de iniciar la aplicación.
4. La espera observa `exitCode` y `signalCode`.
5. Una terminación temprana incluye código, señal y los últimos 4.000
   caracteres de `stdout/stderr`.
6. El teardown espera salida normal, escala a `SIGKILL` de forma acotada y
   falla si el proceso continúa vivo.

Una falla de configuración forzada demostró que el nuevo harness termina en
menos de un segundo y muestra el stack y la variable inválida, en vez de
esperar 30 segundos.

## 4. Archivos técnicos

- `site/scripts/media/cli.ts`: comunica el puerto efectivo asignado por Node.
- `site/tests/e2e/media-http.test.mjs`: asignación por SO, readiness real,
  diagnóstico de hijo y cierre verificable.

No se modificaron migraciones, tablas, RLS, schemas, renderers, capacidades,
dependencias, patches ni lockfile.

## 5. Estabilización focalizada

`pnpm test:media-e2e` aprobó cinco veces consecutivas. Cada ejecución fue
precedida por `pnpm test:prepare-media`, que reconstruyó migraciones, seed y
almacenamiento sintético.

| Ejecución | Resultado | Casos |
| --- | --- | --- |
| 1 | Aprobada | 2/2 |
| 2 | Aprobada | 2/2 |
| 3 | Aprobada | 2/2 |
| 4 | Aprobada | 2/2 |
| 5 | Aprobada | 2/2 |

Total focalizado sobre el diff definitivo: **10/10**, sin procesos residuales.

## 6. Regresión local

| Suite | Resultado |
| --- | --- |
| `pnpm install --frozen-lockfile` | Aprobada; sin cambios |
| `pnpm verify` | Aprobada; 78 pruebas, build y secretos |
| `pnpm test:db` | 8/8 |
| `pnpm test:auth` | 19/19 |
| `pnpm test:admin` | 14/14 |
| `pnpm test:client` | 12/12 |
| `pnpm test:operations` | 8/8 |
| `pnpm test:content` | 38/38 |
| `pnpm test:media-seed` | 5/5 |
| `pnpm test:media` | 11/11 |
| `pnpm test:templates` | 13/13 |
| `pnpm test:onboarding` | 5/5 |
| E2E oficiales | 11/11 |
| `pnpm security:audit` | 0 vulnerabilidades conocidas |

Una primera invocación local de `test:client` usó por error
`APP_URL=http://127.0.0.1:3000`, distinto del `http://localhost:3000` oficial,
y fue rechazada por el control de origen. Repetida con la configuración del
workflow, aprobó 12/12. No se modificó código para esa diferencia ambiental.

Lint conserva las seis advertencias heredadas `no-img-element`, sin errores.

## 7. Compatibilidad preservada

Restaurant conserva tres plantillas, catálogo, preview, selección, editor,
multimedia, publicación, restauración, resolución pública y onboarding.

Gym conserva únicamente `gym`, `gym.v1`, `gym-pulso-v1`, `gym-pulso`, variantes
Volt/Studio/Forge, catálogo privado y preview privado para Cliente
Administrador y Administrador nexi. Selección, editor, publicación,
restauración, onboarding y resolución pública Gym siguen bloqueados.

## 8. Limpieza

- almacenamiento sintético 10A.6 eliminado;
- servicio persistente local detenido;
- procesos de aplicación/harness: 0;
- listeners en 43127, 43300–43499 y 33300–33499: 0;
- scripts de colisión y wrappers temporales eliminados;
- migraciones y datos productivos no modificados.

## 9. CI y cierre

El primer commit validado de la corrección,
`43b06745ba19aa5e096de82c9b13fe4db2400abe`, ejecutó el workflow CI #33:

- **Run:** `31990889702`;
- **Job:** `Verify application` (`95274134591`);
- **Resultado:** `SUCCESS`;
- **E2E multimedia:** `SUCCESS`;
- **Audit y cleanup:** `SUCCESS`;
- **Deployments:** 0.

Esta evidencia confirmó la reparación en GitHub Actions. El Pull Request #11
fue integrado después de revisión humana. La CI post-merge, run `31991954329`,
aprobó sobre `e90cddc9edfbaafc52b9da4667703365b663516b`, incluidos E2E multimedia,
audit y cleanup. La integración no habilitó staging, producción ni una
capacidad funcional nueva.
