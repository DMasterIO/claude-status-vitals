# status-vitals

Mod de Claude Code que dibuja una banda sobre el prompt con:

- cuenta con la que estás logueado, repositorio y rama (con `(worktree)` si corresponde);
- costo de la sesión;
- barras de la cuota de 5 horas y semanal, con el tiempo hasta que reinician;
- barra del contexto y un aviso `✂ time to compact` cuando se llena.

Colores: verde (< 70 %), amarillo (70–90 %), rojo (≥ 90 %). Solo muestra datos reales
que reporta el motor; se refresca con cada respuesta, al terminar cada turno y cada minuto.

## Instalación

En una sesión de terminal:

```
/plugin install status-vitals --marketplace DMasterIO/claude-status-vitals
```

Desde un shell:

```
claude plugin install status-vitals --marketplace DMasterIO/claude-status-vitals
```

## Opciones

- `compactAt`: porcentaje de contexto desde el que aparece el aviso de compactar (por defecto 60).
