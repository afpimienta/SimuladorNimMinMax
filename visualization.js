/**
 * visualization.js — Capa de presentación.
 * ---------------------------------------------------------------------------
 * Convierte la TRAZA real de eventos de los algoritmos en un modelo de vista
 * (nodos, estados, valores, podas) y lo pinta:
 *   - tablero de fichas del estado actual,
 *   - árbol de búsqueda con layout calculado (sin solapes) y zoom,
 *   - panel educativo (qué hace el algoritmo en cada paso),
 *   - estadísticas.
 *
 * Nada de esto "adivina" resultados: todo procede de los eventos emitidos por
 * algorithms.js (enter, expand, evaluate, bound, prune, assign, done).
 */
(function (global) {
  'use strict';

  /* --------------------------------------------------------------------- *
   *  Geometría del árbol                                                   *
   * --------------------------------------------------------------------- *
   * Dibujo de arriba abajo: cada profundidad es una fila y los hijos de un   *
   * nodo se colocan de IZQUIERDA A DERECHA en el mismo orden en que los      *
   * explora el algoritmo (primero fila 1, luego fila 2; dentro de la fila,   *
   * retirar 1, después 2, …). Cada hoja ocupa una columna, de modo que el    *
   * orden de exploración se lee literalmente de izquierda a derecha.         *
   * --------------------------------------------------------------------- */
  const NODE_W = 168;
  const NODE_H = 116;
  const SLOT_W = NODE_W + 16;   // una columna por hoja (izquierda -> derecha)
  const ROW_H = NODE_H + 40;    // una fila por profundidad (arriba -> abajo)
  const PAD = 28;

  /* --------------------------- Zoom del árbol -------------------------- *
   * El zoom se aplica con `transform: scale()` sobre el lienzo; el contenedor
   * crece a tamaño lógico × zoom para que el desplazamiento sea correcto.    */
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 2;
  const ZOOM_STEP = 0.1;

  function clampZoom(z) {
    const n = Number(z);
    if (!isFinite(n)) return 1;
    return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n)) * 100) / 100;
  }

  function fmtValue(v) {
    if (v === null || v === undefined) return '—';
    if (v === Infinity) return '∞';
    if (v === -Infinity) return '-∞';
    return v > 0 ? '+' + v : String(v);
  }

  function fmtBound(v) {
    if (v === Infinity) return '∞';
    if (v === -Infinity) return '-∞';
    return v === null || v === undefined ? '—' : String(v);
  }

  function fmtState(state) {
    return '[' + state.join(', ') + ']';
  }

  function playerClass(player) {
    return player === 'MAX' ? 'max' : 'min';
  }

  function movesLabel(state) {
    return state.map(function (n) { return '<span class="tnode__chip">' + n + '</span>'; }).join('');
  }

  /* --------------------------------------------------------------------- *
   *  Modelo de vista: traza -> nodos del árbol                             *
   * --------------------------------------------------------------------- */
  function blankNode() {
    return {
      id: null,
      state: null,
      player: null,
      depth: 0,
      parentId: null,
      moveIndex: null,
      via: null,
      parent: null,
      children: [],
      moves: null,
      entered: false,
      status: 'pending',   // pending | visiting | open | evaluated | terminal | pruned
      value: null,
      provisional: null,
      bestChildIndex: null,
      alpha: null,
      beta: null,
      prunedInfo: null,
      col: 0,
      row: 0,
      px: 0,
      py: 0
    };
  }

  function fillNode(node, e) {
    node.id = e.id;
    node.state = e.state.slice();
    node.player = e.player;
    node.depth = e.depth;
    node.parentId = e.parentId;
    node.moveIndex = e.moveIndex;
    if (e.via) {
      node.via = {
        row: e.via.row,
        remove: e.via.remove,
        label: e.via.label || ('Fila ' + (e.via.row + 1) + ': quitar ' + e.via.remove)
      };
    } else {
      node.via = null;
    }
    node.entered = true;
    node.alpha = e.alpha;
    node.beta = e.beta;
  }

  /**
   * Reconstruye el estado de la visualización procesando los eventos
   * trace[0..upto]. Procesarlos de nuevo desde cero garantiza que "anterior"
   * y "reiniciar" reproduzcan exactamente la misma historia real.
   */
  function buildModel(trace, upto) {
    const game = global.NimGame;
    const nodes = [];
    const byId = new Map();
    const stack = [];
    const stats = { visited: 0, evaluated: 0, terminals: 0, pruned: 0, generated: 0, maxDepth: 0 };
    let rootId = null;
    let lastEvent = null;
    let done = null;
    let prunedTotal = 0;

    const last = Math.min(upto, trace.length - 1);
    for (let i = 0; i <= last; i++) {
      const e = trace[i];
      lastEvent = e;

      if (e.type === 'enter') {
        let node;
        if (e.parentId === null || e.parentId === undefined) {
          node = blankNode();
          fillNode(node, e);
          node.status = 'visiting';
          rootId = node.id;
          nodes.push(node);
        } else {
          const parent = byId.get(e.parentId);
          if (!parent) continue;
          node = parent.children[e.moveIndex];
          if (!node) {
            node = blankNode();
            parent.children[e.moveIndex] = node;
            nodes.push(node);
          }
          fillNode(node, e);
          node.parent = parent;
          node.status = 'visiting';
        }
        byId.set(node.id, node);

        const top = stack[stack.length - 1];
        if (top && top.status === 'visiting') top.status = 'open';
        stack.push(node);

        stats.visited++;
        if (e.depth > stats.maxDepth) stats.maxDepth = e.depth;
      } else if (e.type === 'expand') {
        const node = byId.get(e.id);
        if (!node) continue;
        node.moves = e.moves;
        node.alpha = e.alpha;
        node.beta = e.beta;
        stats.generated += e.moves.length;
        const childPlayer = game.other(node.player);
        e.moves.forEach(function (m, idx) {
          if (node.children[idx]) return;
          const child = blankNode();
          child.state = m.next.slice();
          child.player = childPlayer;
          child.depth = node.depth + 1;
          child.parentId = node.id;
          child.moveIndex = idx;
          child.via = { row: m.row, remove: m.remove, label: m.label };
          child.parent = node;
          child.status = 'pending';
          node.children[idx] = child;
          nodes.push(child);
        });
      } else if (e.type === 'evaluate') {
        const node = byId.get(e.id);
        if (!node) continue;
        node.status = 'terminal';
        node.value = e.value;
        node.alpha = e.alpha;
        node.beta = e.beta;
        popNode(stack, node);
        stats.terminals++;
        stats.evaluated++;
      } else if (e.type === 'assign') {
        const node = byId.get(e.id);
        if (!node) continue;
        node.status = 'evaluated';
        node.value = e.value;
        node.bestChildIndex = e.bestChildIndex;
        node.alpha = e.alpha;
        node.beta = e.beta;
        popNode(stack, node);
        stats.evaluated++;
      } else if (e.type === 'bound') {
        const node = byId.get(e.id);
        if (!node) continue;
        node.provisional = e.value;
        node.alpha = e.alpha;
        node.beta = e.beta;
        node.lastChildIndex = e.childIndex;
      } else if (e.type === 'prune') {
        const node = byId.get(e.id);
        if (!node) continue;
        node.alpha = e.alpha;
        node.beta = e.beta;
        for (let k = e.fromIndex + 1; k < node.children.length; k++) {
          const child = node.children[k];
          if (child && !child.entered && child.status === 'pending') {
            child.status = 'pruned';
            child.prunedInfo = { alpha: e.alpha, beta: e.beta, condition: e.condition };
            stats.pruned++;
            prunedTotal++;
          }
        }
      } else if (e.type === 'done') {
        done = { value: e.value, bestMove: e.bestMove };
      }
    }

    // Nodo "en foco" = nodo del evento actual (donde está trabajando el algoritmo).
    // Si el evento no referencia un nodo (p. ej. "done"), se usa la cima de la
    // pila de exploración y, al final, la raíz.
    let currentId = null;
    if (lastEvent && lastEvent.id !== undefined && lastEvent.id !== null && byId.has(lastEvent.id)) {
      currentId = lastEvent.id;
    } else if (stack.length) {
      currentId = stack[stack.length - 1].id;
    } else {
      currentId = rootId;
    }

    return {
      nodes: nodes,
      byId: byId,
      rootId: rootId,
      stack: stack,
      currentId: currentId,
      stats: stats,
      lastEvent: lastEvent,
      done: done,
      prunedTotal: prunedTotal,
      index: last,
      total: trace.length
    };
  }

  function popNode(stack, node) {
    while (stack.length && stack[stack.length - 1] !== node) stack.pop();
    if (stack.length && stack[stack.length - 1] === node) stack.pop();
  }

  /* --------------------------------------------------------------------- *
   *  Layout (posiciones en píxeles) — evita cualquier solape               *
   * --------------------------------------------------------------------- *
   * Árbol clásico: profundidad hacia abajo, hermanos de izquierda a derecha
   * siguiendo el orden de exploración (moveIndex creciente). Cada hoja ocupa
   * una columna propia y un nodo interno se centra sobre sus hijos.
   * --------------------------------------------------------------------- */
  function layout(model) {
    let slot = 0;                     // índice de columna para las hojas
    const root = model.rootId === null ? null : model.byId.get(model.rootId);

    function place(node, depth) {
      node.row = depth;               // profundidad -> eje vertical
      const kids = node.children.filter(Boolean);
      if (kids.length === 0) {
        node.col = slot++;            // hoja: siguiente columna (izq. -> der.)
      } else {
        kids.forEach(function (k) { place(k, depth + 1); });
        node.col = (kids[0].col + kids[kids.length - 1].col) / 2;  // centrado
      }
    }
    if (root) place(root, 0);

    let maxCol = 0, maxRow = 0;
    model.nodes.forEach(function (n) {
      n.px = PAD + n.col * SLOT_W;
      n.py = PAD + n.row * ROW_H;
      if (n.col > maxCol) maxCol = n.col;
      if (n.row > maxRow) maxRow = n.row;
    });

    model.width = PAD * 2 + maxCol * SLOT_W + NODE_W;
    model.height = PAD * 2 + maxRow * ROW_H + NODE_H;
    if (model.nodes.length === 0) {
      model.width = PAD * 2 + NODE_W;
      model.height = PAD * 2 + NODE_H;
    }
    return model;
  }

  /* --------------------------------------------------------------------- *
   *  Árbol                                                                 *
   * --------------------------------------------------------------------- */
  function edgePath(x1, y1, x2, y2) {
    if (Math.abs(y1 - y2) < 1) return 'M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2;
    const mx = x1 + (x2 - x1) / 2;
    const r = Math.min(12, Math.abs(y2 - y1) / 2, Math.abs(mx - x1), Math.abs(x2 - mx));
    const dir = y2 > y1 ? 1 : -1;
    return 'M ' + x1 + ' ' + y1 +
      ' L ' + (mx - r) + ' ' + y1 +
      ' Q ' + mx + ' ' + y1 + ' ' + mx + ' ' + (y1 + dir * r) +
      ' L ' + mx + ' ' + (y2 - dir * r) +
      ' Q ' + mx + ' ' + y2 + ' ' + (mx + r) + ' ' + y2 +
      ' L ' + x2 + ' ' + y2;
  }

  function noteFor(node, isAB) {
    if (node.status === 'pruned' && node.prunedInfo) return node.prunedInfo.condition;
    if (isAB && (node.alpha !== null || node.beta !== null)) {
      return 'α ' + fmtBound(node.alpha) + ' · β ' + fmtBound(node.beta);
    }
    switch (node.status) {
      case 'terminal': return 'terminal';
      case 'evaluated': return 'valor fijo';
      case 'visiting': return 'explorando…';
      case 'open': return 'expandido';
      default: return 'sin explorar';
    }
  }

  function bodyFor(node) {
    if (node.status === 'pruned') return '<span class="tnode__flag">PODADA</span>';
    if (node.status === 'terminal' || node.status === 'evaluated') {
      const cls = node.value === 1 ? 'is-win' : 'is-loss';
      return '<span class="tnode__value ' + cls + '">' + fmtValue(node.value) + '</span>' +
        '<span class="tnode__check" title="nodo evaluado">✓</span>';
    }
    if (node.provisional !== null && node.provisional !== undefined) {
      return '<span class="tnode__value is-partial" title="mejor valor parcial">' +
        fmtValue(node.provisional) + '</span><span class="tnode__check tnode__check--partial">…</span>';
    }
    return '<span class="tnode__value is-na">·</span>';
  }

  function tooltipFor(node) {
    let t = 'Nodo ' + (node.id === null ? '(sin explorar)' : '#' + node.id) +
      ' · estado ' + fmtState(node.state) +
      ' · ' + node.player + ' · profundidad ' + node.depth;
    if (node.status === 'pruned' && node.prunedInfo) t += '\nPoda: ' + node.prunedInfo.condition;
    else if (node.value !== null) t += '\nValor: ' + fmtValue(node.value);
    if (node.via) t += '\nMovimiento: ' + node.via.label;
    return t;
  }

  /**
   * Dibuja el árbol. `opts.zoom` (por defecto 1) aplica un factor de escala:
   * los hijos mantienen sus coordenadas lógicas (px/py) y el contenedor crece
   * a `model.size × zoom` para que las barras de desplazamiento sigan siendo
   * correctas (el `transform: scale()` no altera el layout por sí solo).
   */
  function renderTree(container, model, options) {
    const opts = options || {};
    const isAB = !!opts.isAlphaBeta;
    const z = typeof opts.zoom === 'number' ? clampZoom(opts.zoom) : 1;
    container.innerHTML = '';
    container.style.width = (model.width * z) + 'px';
    container.style.height = (model.height * z) + 'px';
    container.style.transform = z === 1 ? '' : 'scale(' + z + ')';

    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'tree-edges');
    svg.setAttribute('width', model.width);
    svg.setAttribute('height', model.height);
    svg.setAttribute('viewBox', '0 0 ' + model.width + ' ' + model.height);

    model.nodes.forEach(function (n) {
      if (!n.parent) return;
      // del centro inferior del padre al centro superior del hijo
      const x1 = n.parent.px + NODE_W / 2;
      const y1 = n.parent.py + NODE_H;
      const x2 = n.px + NODE_W / 2;
      const y2 = n.py;
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', edgePath(x1, y1, x2, y2));
      let cls = 'edge';
      if (n.status === 'pruned') cls += ' edge--pruned';
      else if (n.id === model.currentId) cls += ' edge--active';
      else if (n.status === 'terminal' || n.status === 'evaluated') cls += ' edge--done';
      path.setAttribute('class', cls);
      svg.appendChild(path);
    });
    container.appendChild(svg);

    const frag = document.createDocumentFragment();
    model.nodes.forEach(function (n) {
      const el = document.createElement('div');
      const isCurrent = n.id !== null && n.id === model.currentId;
      el.className = 'tnode tnode--' + playerClass(n.player) +
        ' is-' + n.status + (isCurrent ? ' is-current' : '');
      el.style.left = n.px + 'px';
      el.style.top = n.py + 'px';
      el.title = tooltipFor(n);
      if (n.id !== null) el.dataset.nodeId = String(n.id);

      el.innerHTML =
        '<div class="tnode__head">' +
          '<span class="tnode__player">' + n.player + '</span>' +
          '<span class="tnode__depth">p' + n.depth + '</span>' +
        '</div>' +
        '<div class="tnode__state">' + movesLabel(n.state) + '</div>' +
        '<div class="tnode__via' + (n.via ? '' : ' tnode__via--root') + '">' +
          (n.via ? '⤷ ' + n.via.label : 'raíz · MAX empieza') +
        '</div>' +
        '<div class="tnode__body">' + bodyFor(n) + '</div>' +
        '<div class="tnode__note">' + noteFor(n, isAB) + '</div>';
      frag.appendChild(el);
    });
    container.appendChild(frag);
  }

  /**
   * Centra el nodo actual SOLO si queda fuera de vista (evita saltos).
   * `zoom` convierte las coordenadas lógicas a coordenadas pintadas y
   * `force` obliga a recentrar (se usa al cambiar el zoom).
   */
  function focusCurrent(scrollEl, container, model, zoom, force) {
    if (model.currentId === null || model.currentId === undefined) return;
    const node = model.byId.get(model.currentId);
    if (!node) return;
    const z = typeof zoom === 'number' ? clampZoom(zoom) : 1;

    const left = node.px * z, right = (node.px + NODE_W) * z;
    const top = node.py * z, bottom = (node.py + NODE_H) * z;
    const vLeft = scrollEl.scrollLeft, vRight = vLeft + scrollEl.clientWidth;
    const vTop = scrollEl.scrollTop, vBottom = vTop + scrollEl.clientHeight;

    const outX = !!force || right > vRight - 12 || left < vLeft + 12;
    const outY = !!force || bottom > vBottom - 12 || top < vTop + 12;
    if (!outX && !outY) return;

    const maxLeft = Math.max(0, container.offsetWidth - scrollEl.clientWidth);
    const maxTop = Math.max(0, container.offsetHeight - scrollEl.clientHeight);
    const targetLeft = outX
      ? Math.min(Math.max(0, (node.px + NODE_W / 2) * z - scrollEl.clientWidth / 2), maxLeft)
      : vLeft;
    const targetTop = outY
      ? Math.min(Math.max(0, (node.py + NODE_H / 2) * z - scrollEl.clientHeight / 2), maxTop)
      : vTop;

    scrollEl.scrollTo({ left: targetLeft, top: targetTop, behavior: 'smooth' });
  }

  /* --------------------------------------------------------------------- *
   *  Tablero de fichas                                                     *
   * --------------------------------------------------------------------- */
  function renderBoard(container, state, meta) {
    const m = meta || {};
    const terminal = state.every(function (n) { return n === 0; });
    let html = '<div class="board__header">' +
      '<span class="board__state">' + fmtState(state) + '</span>' +
      '<span class="board__turn">' +
        (terminal
          ? '<span class="pill pill--end">FIN</span> partida terminada'
          : '<span class="pill pill--' + playerClass(m.player) + '">' + m.player + '</span> en turno') +
      '</span>' +
    '</div>';

    html += '<div class="board__rows">';
    state.forEach(function (count, i) {
      const changed = m.lastMove && m.lastMove.row === i;
      let fichas = '';
      for (let k = 0; k < count; k++) fichas += '<span class="ficha" style="--i:' + k + '"></span>';
      if (changed && m.lastMove) {
        for (let k = 0; k < m.lastMove.remove; k++) fichas += '<span class="ficha ficha--removed"></span>';
      }
      if (count === 0 && !(changed && m.lastMove)) fichas = '<span class="board__empty">fila vacía</span>';

      html += '<div class="board__row' + (changed ? ' is-changed' : '') + '">' +
        '<span class="board__rowlabel">Fila ' + (i + 1) + '</span>' +
        '<span class="board__fichas">' + (fichas || '<span class="board__empty">fila vacía</span>') + '</span>' +
        '<span class="board__count">' + count + (changed && m.lastMove ? '<em>−' + m.lastMove.remove + '</em>' : '') + '</span>' +
      '</div>';
    });
    html += '</div>';

    if (m.note) html += '<p class="board__note">' + m.note + '</p>';
    container.innerHTML = html;
  }

  /* --------------------------------------------------------------------- *
   *  Panel educativo                                                      *
   * --------------------------------------------------------------------- */
  function describeEvent(event, model, isAB) {
    const game = global.NimGame;
    if (!event) return 'Pulsa «Siguiente» para iniciar la búsqueda.';
    const node = event.id !== undefined && event.id !== null ? model.byId.get(event.id) : null;
    const state = node && node.state ? node.state : event.state;

    switch (event.type) {
      case 'enter': {
        if (event.parentId === null || event.parentId === undefined) {
          return 'Inicio de la búsqueda. <strong>MAX</strong> parte del estado ' +
            '<strong>' + fmtState(event.state) + '</strong> y debe <strong>maximizar</strong> la utilidad ' +
            '(+1 = victoria de MAX, -1 = victoria de MIN). MAX juega primero y el estado se convierte en la raíz del árbol.';
        }
        const via = event.via
          ? 'tras el movimiento <strong>' + game.formatMove(event.via) + '</strong>'
          : '';
        const role = event.player === 'MAX'
          ? 'MAX intenta <strong>maximizar</strong> (subir hacia +1)'
          : 'MIN intenta <strong>minimizar</strong> (bajar hacia -1)';
        return 'El algoritmo desciende al nodo ' + (node ? '#' + node.id : '') + ' (' +
          '<strong>' + event.player + '</strong>, profundidad ' + event.depth + ') con estado <strong>' +
          fmtState(event.state) + '</strong>, ' + via + '. ' + role +
          (isAB ? '. Se hereda la ventana α/β del padre.' : '.');
      }
      case 'expand': {
        const labels = event.moves.map(function (m) { return m.label; }).join(' · ');
        return 'Desde <strong>' + fmtState(state) + '</strong> se generan <strong>' + event.moves.length +
          '</strong> movimientos legales (se retiran una o más fichas de una sola fila) siguiendo el ' +
          '<strong>orden obligatorio de exploración</strong>: primero la fila 1 y después la fila 2; dentro de ' +
          'la misma fila, retirar 1, después 2, después 3… Es el orden en que se recorrerán, ' +
          '<strong>en profundidad y de izquierda a derecha</strong>:<br><span class="move-list">' +
          labels + '</span>';
      }
      case 'evaluate': {
        const loser = event.player;
        const winner = loser === 'MAX' ? 'MIN' : 'MAX';
        return '<strong>' + fmtState(state) + '</strong> es un estado <strong>terminal</strong>: no quedan fichas. ' +
          'Le toca mover a <strong>' + loser + '</strong>, que no puede retirar nada, así que <strong>' + loser +
          '</strong> pierde y gana <strong>' + winner + '</strong>. Se aplica la función de utilidad: <strong>u = ' +
          fmtValue(event.value) + '</strong>.';
      }
      case 'bound': {
        const parent = model.byId.get(event.id);
        const total = parent && parent.moves ? parent.moves.length : 0;
        const move = parent && parent.moves && parent.moves[event.childIndex]
          ? parent.moves[event.childIndex].label : '';
        const who = event.player === 'MAX'
          ? 'MAX conserva el <strong>máximo</strong>'
          : 'MIN conserva el <strong>mínimo</strong>';
        const win = isAB
          ? '. Ventana actualizada: <strong>α = ' + fmtBound(event.alpha) + '</strong>, <strong>β = ' + fmtBound(event.beta) + '</strong>'
          : '';
        return 'Tras evaluar el hijo ' + (event.childIndex + 1) + ' de ' + total + ' (' + move + '), ' + who +
          ' y su mejor valor parcial es <strong>' + fmtValue(event.value) + '</strong>' + win + '.';
      }
      case 'prune': {
        const n = event.skipped.length;
        const resto = n === 1
          ? 'la <strong>1</strong> rama restante <strong>no se explora</strong>'
          : 'las <strong>' + n + '</strong> ramas restantes <strong>no se exploran</strong>';
        return '<strong>¡PODA!</strong> Se cumple la condición <strong>' + event.condition +
          '</strong>. El valor de <strong>' + event.player + '</strong> ya no puede mejorar dentro de esta ventana, ' +
          'por lo que ' + resto + ' (son las ramas hermanas que quedan a la <strong>derecha</strong> de la última ' +
          'explorada; se quedan visibles pero atenuadas y marcadas como PODADA).';
      }
      case 'assign': {
        const parent = model.byId.get(event.id);
        const move = parent && parent.bestChildIndex !== null && parent.moves && parent.moves[parent.bestChildIndex]
          ? parent.moves[parent.bestChildIndex].label : null;
        return 'El nodo <strong>' + fmtState(state) + '</strong> (' + event.player +
          ') queda con valor definitivo <strong>' + fmtValue(event.value) + '</strong>' +
          (move ? '. La opción elegida es <strong>' + move + '</strong>' : '') +
          '. El valor se devuelve al padre, que actualizará su propio mejor valor.';
      }
      case 'done': {
        const g = event.value === 1 ? 'MAX' : 'MIN';
        return '<strong>Búsqueda completada.</strong> Valor final de la raíz: <strong>' + fmtValue(event.value) +
          '</strong> → con juego perfecto <strong>gana ' + g + '</strong>. Mejor movimiento para MAX: <strong>' +
          (event.bestMove ? game.formatMove(event.bestMove) : '—') + '</strong>' +
          (event.bestMove ? ' (lleva a ' + fmtState(event.bestMove.next) + ')' : '') + '.';
      }
      default:
        return '';
    }
  }

  function renderEducational(container, ctx) {
    const names = {
      enter: 'DESCENSO',
      expand: 'EXPANSIÓN',
      evaluate: 'TERMINAL',
      bound: 'ACTUALIZACIÓN',
      prune: 'PODA',
      assign: 'VALOR',
      done: 'FIN'
    };
    const e = ctx.event;
    let html = '<div class="edu__top">' +
      '<span class="event-badge event-badge--' + (e ? e.type : 'none') + '">' + (e ? names[e.type] || e.type : '—') + '</span>' +
      '<span class="edu__step">Paso ' + (ctx.index + 1) + ' de ' + ctx.total + '</span>' +
    '</div>';
    html += '<p class="edu__text">' + describeEvent(e, ctx.model, ctx.isAlphaBeta) + '</p>';

    if (ctx.isAlphaBeta) {
      const hasWindow = !!e && Object.prototype.hasOwnProperty.call(e, 'alpha');
      const alpha = hasWindow ? e.alpha : null;
      const beta = hasWindow ? e.beta : null;
      const closed = hasWindow && alpha !== null && beta !== null && alpha >= beta;
      html += '<div class="window">' +
        '<div class="window__item"><span class="window__sym window__sym--a">α</span>' +
          '<span class="window__label">Alfa (suelo de MAX)</span>' +
          '<span class="window__val">' + fmtBound(alpha) + '</span></div>' +
        '<div class="window__rule"></div>' +
        '<div class="window__item"><span class="window__sym window__sym--b">β</span>' +
          '<span class="window__label">Beta (techo de MIN)</span>' +
          '<span class="window__val">' + fmtBound(beta) + '</span></div>' +
        '<div class="window__state">' +
          (closed
            ? '<span class="window__cut">α ≥ β → corte</span>'
            : (hasWindow
              ? '<span class="window__open">ventana abierta</span>'
              : '<span class="window__open">búsqueda finalizada</span>')) +
        '</div>' +
      '</div>';
    }
    container.innerHTML = html;
  }

  /* --------------------------------------------------------------------- *
   *  Estadísticas                                                          *
   * --------------------------------------------------------------------- */
  function renderStats(container, ctx) {
    const s = ctx.stats;
    const done = ctx.done;
    const cards = [
      { k: 'Nodos explorados', v: s.visited, c: 'blue', d: 'eventos "enter": nodos Visitados por el algoritmo' },
      { k: 'Nodos evaluados', v: s.evaluated, c: 'green', d: 'nodos a los que se les asignó un valor (terminales + internos)' },
      { k: 'Nodos terminales', v: s.terminals, c: 'dark', d: 'estados sin fichas, evaluados con la utilidad +1 / -1' },
      { k: 'Nodos podados', v: s.pruned, c: 'violet', d: 'ramas descartadas por la poda Alfa-Beta' },
      { k: 'Profundidad', v: s.maxDepth, c: 'amber', d: 'profundidad máxima alcanzada en esta ejecución' },
      { k: 'Movimientos generados', v: s.generated, c: 'slate', d: 'movimientos legales creados con generateMoves' }
    ];
    let html = '<div class="stats-grid">';
    cards.forEach(function (c) {
      html += '<div class="stat stat--' + c.c + '" title="' + c.d + '">' +
        '<span class="stat__k">' + c.k + '</span>' +
        '<span class="stat__v">' + c.v + '</span>' +
      '</div>';
    });
    html += '<div class="stat stat--result" title="valor de la utilidad en la raíz">' +
      '<span class="stat__k">Valor final</span>' +
      '<span class="stat__v ' + (done ? (done.value === 1 ? 'is-win' : 'is-loss') : '') + '">' +
      (done ? fmtValue(done.value) : '…') + '</span></div>';
    html += '<div class="stat stat--result" title="mejor movimiento de MAX en la raíz">' +
      '<span class="stat__k">Mejor movimiento</span>' +
      '<span class="stat__v stat__v--move">' + (done && done.bestMove ? global.NimGame.formatMove(done.bestMove) : '…') + '</span></div>';
    html += '</div>';
    container.innerHTML = html;
  }

  global.Viz = {
    NODE_W: NODE_W,
    NODE_H: NODE_H,
    ZOOM_MIN: ZOOM_MIN,
    ZOOM_MAX: ZOOM_MAX,
    ZOOM_STEP: ZOOM_STEP,
    clampZoom: clampZoom,
    buildModel: buildModel,
    layout: layout,
    renderTree: renderTree,
    focusCurrent: focusCurrent,
    renderBoard: renderBoard,
    renderEducational: renderEducational,
    renderStats: renderStats,
    describeEvent: describeEvent,
    fmtValue: fmtValue,
    fmtBound: fmtBound,
    fmtState: fmtState
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
