# trazosuite

CLI para trabajar con TrazoSuite desde la terminal: tareas, comentarios y
finanzas. Sirve también para automatizar con agentes de IA.

## Instalación

    npm install -g trazosuite

Requiere Node.js 20 o superior.

## Uso

Inicia sesión con un token de API. Lo generas en tu instancia de TrazoSuite,
en Perfil → MCP Proyectos; se muestra una sola vez al crearlo:

    trazosuite login

Te pide la URL de tu instancia y el token. La sesión queda guardada en tu
computadora y los comandos actúan con tu usuario, respetando tu rol en cada
proyecto:

    trazosuite whoami
    trazosuite project list <workspace>
    trazosuite issue list <workspace> <proyecto>
    trazosuite issue create <workspace> <proyecto> --name "Nueva tarea"
    trazosuite issue move <workspace> <proyecto> 12 --state <estado>
    trazosuite comment add <workspace> <proyecto> 12 --html "<p>avance</p>"

Los comandos imprimen JSON por defecto; agrega `--text` para salida legible.
`trazosuite --help` lista todos los comandos y sus opciones.

## Finanzas

`trazosuite finance ...` agrupa gastos, categorías, recurrentes, ingresos,
empleados y nómina. Solo funciona con tokens de administradores del workspace.

## Credenciales

La sesión se guarda en `~/.config/trazosuite/credentials.json` con permisos
`0600`. `trazosuite logout` la borra. Las variables `TRAZO_API_URL` y
`TRAZO_API_TOKEN` tienen prioridad sobre lo guardado (útil para agentes y CI).

## Licencia

AGPL-3.0-only. El código fuente de este paquete está en este repositorio.
