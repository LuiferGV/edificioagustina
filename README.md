# Edificio Agustina

Aplicacion web base para administrar el edificio: ocupacion, cobranzas, incidencias y comunicacion interna.

## Scripts

- `.\pnpm.cmd install`
- `.\pnpm.cmd dev`
- `.\pnpm.cmd build`
- `.\pnpm.cmd preview`

## Stack

- React 19
- Vite 7
- TypeScript

## Firebase

- La app usa Firebase Auth con email/password.
- La app lee Realtime Database con sesion autenticada.
- El frontend busca un snapshot compatible en la raiz o dentro de `dashboard`, `buildingSnapshot` o `snapshot`.
- Si no encuentra una estructura compatible, muestra el panel demo para no dejar la interfaz vacia.
- La estructura nueva usa `spaces` como fuente principal para departamentos, salones, accionistas y terraza.
- Desde la app puedes cargar una base inicial y luego editar cada espacio guardando directo en Firebase.

## Estado actual

La app ya incluye:

- acceso por Firebase Auth
- lectura protegida desde Realtime Database
- distribucion real del edificio con departamentos, salones y terraza
- formulario para cargar responsable de pago, cedula, ocupantes extra, alquiler y vencimientos
- boton para sembrar la estructura inicial del edificio en Firebase
