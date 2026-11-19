# Personajes prehechos

Un archivo `NN-clase.toml` por personaje. El prefijo numérico define el orden en el modal.
`_objetos.toml` es el catálogo de objetos compartidos.

Después de editar, corré `pnpm premades` (también corre solo con `pnpm dev` y `pnpm build`).
El generador valida todo y escribe `src/scripts/data/premades.generated.ts`, que **no se edita a mano**.
Si algo está mal, falla con un mensaje que dice el archivo, el objeto y el problema.

## Campos del personaje

| Campo | Descripción |
|---|---|
| `id` | Único, p. ej. `"premade-guerrero"` |
| `class` | Una de las 12 clases (`"Guerrero"`, `"Mago"`, …) |
| `name`, `title`, `race`, `subclass`, `description` | Texto |
| `alignment` | Opcional, por defecto `"Neutral"` |
| `avatar` | 1–5 → `/characters/ch-N.avif` |
| `hp_max` | PG a nivel 1 (los niveles siguientes se calculan) |
| `speed_ft` | Velocidad en pies |
| `gold` | Monedas de oro iniciales |
| `demo` | `true` si puede salir sorteado en el modo demo |
| `skills`, `expertise` | Ids de habilidades (`"stealth"`, `"perception"`, …); lo que está en `expertise` tiene que estar también en `skills` |
| `spells` | Ids de conjuros de `classStarterKits.ts` |
| `[stats]` | `str`, `dex`, `con`, `int`, `wis`, `cha` |

Las claves sueltas (`skills`, `spells`, …) van **antes** de `[stats]` y `[[items]]` (regla de TOML).

## Objetos (`[[items]]`)

Cada objeto puede tomar uno del catálogo con `ref` y pisar lo que quiera, o definirse entero en el lugar.
`ref` busca primero en `_objetos.toml` y después en los kits de clase (`kit-fighter-longsword`, …).

```toml
[[items]]
ref = "kit-fighter-longsword"
equipped = true          # sin esto queda guardado en la mochila
slot = "mainHand"        # head, body, gloves, neck, ring1, ring2, boots, cloak, mainHand, offHand, shield

[[items]]
ref = "pocion-curacion"
quantity = 3

[[items]]
name = "Amuleto del Clan"
category = "treasure"
requires_attunement = true   # el objeto necesita sintonización
attuned = true               # empieza sintonizado (máximo 3 por personaje)
equipped = true
slot = "neck"

[[items.effects]]            # solo cuenta si está equipado y sintonizado
target = "save.wis"
op = "add"
value = 1
```

Si usás el mismo `ref` dos veces, agregá `id = "..."` distinto a cada uno.
