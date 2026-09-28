# Minimax y Poda Alfa‑Beta en el juego de Nim

Aplicación **educativa e interactiva** para visualizar, paso a paso, cómo funcionan
el algoritmo **Minimax** y la **poda Alfa‑Beta** sobre el juego de Nim.

Hecha con **HTML + CSS + JavaScript vanilla**: sin backend, sin dependencias ni
pasos de build. Todo el árbol de búsqueda se genera en tiempo real a partir de la
lógica del juego (nada está hardcodeado) y la animación se alimenta de los
**eventos reales** que emiten los algoritmos.

- Estado inicial obligatorio y principal: **`[1, 3]`** (dos filas), con **MAX** empezando.
- Orden de exploración obligatorio: fila 1 antes que fila 2 · retirar 1 antes que 2 ·
  recorrido en profundidad y de izquierda a derecha.
- Pruebas automáticas incluidas: **99/99 superadas**.

---

## 1. Reglas de Nim

1. Hay varias filas con un número de fichas cada una (ej. `[1, 3]`).
2. En su turno, un jugador debe **retirar una o más fichas de una sola fila**
   (puede vaciarla por completo).
3. No se puede pasar el turno ni retirar fichas de varias filas a la vez.
4. **Gana quien retira la última ficha**: el jugador que le toca mover y ya no
   tiene movimientos (tablero vacío) **pierde**.

La aplicación usa la variante normal (quien mueve primero gana con juego perfecto
si conoce la estrategia).

## 2. Representación de estados

- Un estado es un **array de enteros no negativos**: `[1, 3]` = fila 1 con 1 ficha,
  fila 2 con 3 fichas.
- **Estado terminal**: todos los componentes son `0`, p. ej. `[0, 0]`.
- **Movimientos legales**: para cada fila `i` y cada `k ∈ {1 … estado[i]}`, se obtiene
  un nuevo estado con `estado[i] = estado[i] - k` (el resto de filas no cambian).

**Orden de exploración obligatorio** (aplica a `generateMoves`, a Minimax y a
Alfa‑Beta, y se refleja en el dibujo del árbol):

1. Primero los movimientos sobre la **fila 1** y después los de la **fila 2** (y
   así sucesivamente, de arriba abajo).
2. Dentro de una misma fila, primero **retirar 1** ficha, después **2**, después
   **3**, … (cantidad creciente).
3. El recorrido del árbol se hace en **profundidad (DFS) y de izquierda a
   derecha**, respetando ese orden: cada hijo se explora entero antes de pasar al
   siguiente, y los hijos se dibujan de izquierda a derecha en el mismo orden en
   que se visitan (las ramas podadas quedan a la derecha de las exploradas).

Ese orden es determinista, así que Minimax y Alfa‑Beta recorren exactamente el
mismo árbol y la poda siempre descarta las ramas **restantes de la derecha**.

- **Función de utilidad** (solo en estados terminales), desde el punto de vista de MAX:
  - `+1` → victoria de **MAX**
  - `-1` → victoria de **MIN**
  - En `[0, 0]`, si le toca mover a `MAX`, entonces `MAX` pierde → `-1`; si le toca a `MIN` → `+1`.

**Turnos:** MAX empieza en la raíz (profundidad par = MAX, profundidad impar = MIN) y
los jugadores alternan estrictamente en cada nivel del árbol.

## 3. Minimax

Búsqueda recursiva (DFS) que devuelve el valor minimax de cada nodo:

```
minimax(nodo, jugador):
    si es terminal:        return utilidad(nodo)         // +1 / -1
    hijos = generarMovimientos(nodo)                      // real, no precalculado
    si jugador == MAX:  return max(minimax(h, MIN) for h in hijos)
    si jugador == MIN:  return min(minimax(h, MAX) for h in hijos)
```

MAX elige el hijo con valor máximo y MIN el mínimo; el valor sube por la rama hasta
la raíz. El **mejor movimiento** es el hijo que aporta ese valor (con mejora estricta,
se conserva el primer mejor hijo, así ambos algoritmos eligen el mismo movimiento).

El recorrido es **en profundidad y de izquierda a derecha**: se generan los hijos con
`generateMoves` (fila 1 antes que fila 2; retirar 1 antes que 2) y se visita el hijo
`i` **entero** —con todo su subárbol— antes de pasar al `i + 1`, que es el que se
dibuja a su derecha.

## 4. Poda Alfa‑Beta

Es el mismo recorrido, manteniendo una ventana `[α, β]`:

- `α` = mejor valor que MAX ya garantiza en el camino (suelo),
- `β` = mejor valor que MIN ya garantiza (techo).

```
α = max(α, valorHijo)   en nodos MAX
β = min(β, valorHijo)   en nodos MIN
si α >= β:  PODA  → no se exploran las ramas restantes de ese nodo
```

Esas ramas **no pueden cambiar el valor final**, así que se descartan sin evaluar.
La poda **no cambia el resultado**: devuelve el mismo valor y el mismo mejor
movimiento que Minimax, pero evalúa (como mucho) los mismos nodos y normalmente muchos menos.

Como el recorrido es en profundidad y de izquierda a derecha, cuando se cumple
`α ≥ β` **se descartan las ramas hermanas que quedan a la derecha** de la que acaba
de cerrar la ventana (nunca las de la izquierda, que ya se exploraron). La eficacia
de la poda depende del orden: con el orden obligatorio, en `[1, 3]` Alfa‑Beta evalúa
26 nodos frente a los 28 de Minimax (ver §7.2).

## 5. Estructura del proyecto

| Archivo | Responsabilidad |
|---|---|
| `index.html` | Estructura semántica de la interfaz y carga de scripts |
| `style.css` | Diseño responsive, árbol, tablero, paneles y estados visuales |
| `game.js` | **Lógica del juego**: estados, movimientos, terminales, utilidad (+1/−1) |
| `algorithms.js` | **Algoritmos**: Minimax y Alfa‑Beta con emisión de eventos (traza) |
| `visualization.js` | **Visualización**: modelo de vista, layout del árbol y pintado de paneles |
| `script.js` | Orquestación: controles, reproducción paso a paso y conexión de todo |
| `tests.js` | Pruebas automáticas (independientes del DOM) |
| `README.md` | Este documento |

La lógica del juego, los algoritmos y la visualización están **separados**: los
algoritmos solo emiten eventos (`enter`, `expand`, `evaluate`, `bound`, `prune`,
`assign`, `done`) y la interfaz los consume, de modo que la animación **representa
fielmente la ejecución real** y no una simulación independiente.

## 6. Cómo ejecutar la aplicación

**Opción A (la más rápida):** abrir `index.html` directamente en el navegador
(doble clic). No hay módulos ES ni peticiones de red, así que funciona con `file://`.

**Opción B (servidor local):** servir la carpeta con cualquier servidor estático:

```bash
npx serve .            # o
python -m http.server 8000
```

y abrir `http://localhost:8000`.

**Despliegue (GitHub Pages / Netlify / Vercel):** es un sitio **estático** sin build.
Sube la carpeta tal cual (o conecta el repositorio). Como solo se usan rutas
relativas, funciona igual en la raíz del dominio o en un subdirectorio.

**Uso:** elige el algoritmo (Minimax / Poda Alfa‑Beta) y el estado inicial
(`[1, 3]` es el caso principal; hay otros pequeños), y usa los botones
**◀ Anterior · ▶ Siguiente · ▶▶ Reproducir · ⏸ Pausar · ↺ Reiniciar**, el deslizador
de progreso o las flechas del teclado `←`/`→` (y `espacio` para reproducir/pausar).
En el panel del árbol, los botones **− / +** ajustan el zoom (50 %–200 %, paso del
10 %) y **100 %** lo restablece; el nodo actual se mantiene centrado al cambiarlo.

## 7. Cómo se validó su funcionamiento

### 7.1 Pruebas automáticas (`tests.js`) — 99 pruebas, 7 grupos

`tests.js` es independiente del DOM. La sección de pruebas se retiró de la interfaz
tras validarse, pero el archivo sigue incluido: para volver a ejecutarlas, abre la
consola del navegador y lanza:

```js
const r = NimTests.run(NimGame.PRESETS);
r.passed + '/' + r.total;          // "99/99"
r.results.filter(x => !x.pass);    // []  (ninguna falla)
```

1. **Movimientos legales** – todo movimiento retira ≥ 1 ficha de una sola fila, no
   excede las fichas de esa fila, no toca las demás filas, no hay duplicados, la
   cantidad de movimientos es `sum(estado)` y un tablero vacío no tiene movimientos.
   Incluye una exploración completa de todos los estados alcanzables desde `[1, 3]`.
2. **Estados terminales** – `[0,0]`/`[0,0,0]` son terminales; `[1,3]` y `[0,1]` no;
   utilidad `-1` con MAX en turno y `+1` con MIN en turno; `null` en no terminales.
3. **Mismo valor y mismo mejor movimiento** – para cada estado se ejecutan los dos
   algoritmos y se contrasta además con un **oráculo independiente (suma XOR/nim‑sum)**:
   con MAX en turno el valor es `+1` si y solo si `nim-sum ≠ 0`, y el mejor movimiento
   deja la suma XOR en `0`.
4. **Eficacia de la poda** – Alfa‑Beta evalúa, visita y evalúa terminales **≤** que
   Minimax en todos los estados; Minimax nunca poda; en `[1, 3]` la poda es efectiva.
5. **Integridad de la traza** – para ambos algoritmos y todos los estados: la raíz es
   MAX en `[1,3]` con profundidad 0, los hijos coinciden con movimientos legales del
   padre, los turnos alternan MAX/MIN, la profundidad crece de 1 en 1, la utilidad de
   cada terminal es correcta, la traza termina en `done` y **ninguna rama podada llega
   a ser explorada**.
6. **Orden de exploración obligatorio** – en `[1, 3]` el orden es
   `Fila 1→1, Fila 2→1, Fila 2→2, Fila 2→3`; en todos los estados las filas van en
   orden ascendente y las cantidades son `1, 2, 3…` dentro de cada fila; y en la
   traza de ambos algoritmos **el padre está siempre en la cima de la pila al entrar
   en un hijo** (DFS) con `moveIndex` estrictamente creciente (izquierda a derecha),
   siendo `0,1,2,3` los hijos explorados en la raíz de `[1, 3]`.
7. **Caso principal `[1, 3]`** – MAX empieza, valor final `+1`, mejor movimiento
   `fila 2 → quitar 2` (llega a `[1, 1]`) y al menos una poda con `α ≥ β`.

### 7.2 Resultados obtenidos (estado `[1, 3]`)

| Métrica | Minimax | Alfa‑Beta |
|---|---|---|
| Valor final | `+1` | `+1` |
| Mejor movimiento | fila 2 → quitar 2 | fila 2 → quitar 2 |
| Nodos explorados / evaluados | 28 | **26** (−7 %) |
| Nodos terminales | 12 | 11 |
| Ramas podadas | 0 | 1 |
| Eventos de la traza | 100 | 94 |

Con el orden obligatorio (fila 1 antes que fila 2 y retirar 1 antes que 2) la poda
sigue siendo correcta pero es menos agresiva que con otros órdenes: la calidad del
orden de movimientos es justamente lo que determina cuántas ramas descarta
Alfa‑Beta.

### 7.3 Verificación manual de la interfaz

Comprobado en navegador recorriendo **todos los pasos** de los dos algoritmos en los
6 estados iniciales, verificando que:

- no hay errores de JavaScript en consola ni pasos desincronizados;
- el resaltado del nodo actual, el tablero y el panel educativo coinciden siempre
  con el evento mostrado (incluidos los nodos terminales y los momentos de poda);
- «anterior», «siguiente», «reiniciar», el deslizador, el teclado y
  «reproducir/pausar» funcionan en cualquier punto de la traza;
- las ramas podadas quedan **visibles, atenuadas y marcadas como `PODADA`** con la
  condición (`α ≥ β (valores)`) que produjo la poda, y siempre **a la derecha** de las
  ramas exploradas de ese nodo;
- el árbol se dibuja **de arriba abajo por niveles** (una profundidad por fila) y los
  hijos de cada nodo **de izquierda a derecha** en el mismo orden en que los explora el
  algoritmo: fila 1 antes que fila 2 y, dentro de la fila, retirar 1 antes que 2;
- el **zoom del árbol** (− / + / 100 %) escala el lienzo sin romper el layout: el
  nodo actual queda centrado, el desplazamiento sigue siendo correcto y al llegar a
  los límites (50 % / 200 %) los botones se desactivan;
- el árbol no presenta solapes ni desbordes (cada nodo queda dentro del lienzo), y la
  página no genera scroll horizontal tanto en escritorio (dos columnas) como en móvil
  (columna única).

Para ejecutar las pruebas por separado con Node (opcional):

```bash
node -e "require('./game.js');require('./algorithms.js');const t=require('./tests.js');const r=t.run();console.log(r.passed+'/'+r.total+' pruebas superadas');r.results.filter(x=>!x.pass).forEach(x=>console.log('FALLA:',x.name))"
```
