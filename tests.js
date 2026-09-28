/**
 * tests.js — Pruebas automáticas del proyecto.
 * ---------------------------------------------------------------------------
 * Comprueba:
 *   1) que los movimientos generados son siempre legales,
 *   2) que los estados terminales (y la utilidad) se detectan correctamente,
 *   3) que Minimax y Alfa-Beta obtienen el MISMO valor y el MISMO mejor movimiento
 *      (contrastados además con un oráculo independiente: la suma XOR / nim-sum),
 *   4) que Alfa-Beta no evalúa más nodos que Minimax,
 *   5) la integridad de la traza de eventos: turnos MAX/MIN alternos, estados
 *      coherentes con los movimientos generados y ramas podadas nunca visitadas,
 *   6) el ORDEN DE EXPLORACIÓN OBLIGATORIO: fila 1 antes que fila 2, dentro de
 *      la fila retirar 1 antes que 2, y recorrido en profundidad y de
 *      izquierda a derecha (moveIndex creciente) en ambos algoritmos,
 *   7) el caso principal [1, 3].
 *
 * Es independiente del DOM: se ejecuta en el navegador y en Node (`node -e`),
 * ya que game.js, algorithms.js y tests.js no tocan el DOM.
 */
(function (global) {
  'use strict';

  function req(name, obj) {
    if (!obj) throw new Error(name + ' debe cargarse antes que tests.js');
    return obj;
  }

  /** Recorre recursivamente todos los estados alcanzables (para pruebas). */
  function walkStates(game, start, limit) {
    const seen = new Set();
    const out = [];
    (function rec(state, depth) {
      const key = state.join(',');
      if (seen.has(key) || depth > limit) return;
      seen.add(key);
      out.push(state.slice());
      game.generateMoves(state).forEach(function (m) { rec(m.next, depth + 1); });
    })(start, 0);
    return out;
  }

  function moveEquals(a, b) {
    return !!a && !!b && a.row === b.row && a.remove === b.remove;
  }

  /** ¿`m` coincide con alguno de la lista? */
  function moveIn(list, m) {
    return list.some(function (x) { return moveEquals(x, m); });
  }

  function runAll(presets) {
    const game = req('NimGame', global.NimGame);
    const Algorithms = req('Algorithms', global.Algorithms);

    const results = [];
    function check(section, name, pass, detail) {
      results.push({ section: section, name: name, pass: !!pass, detail: detail || '' });
    }

    const states = (presets || game.PRESETS).map(function (p) {
      return Array.isArray(p) ? p : p.state;
    });

    /* ------------------------------------------------------------------ *
     * 1) Movimientos legales                                              *
     * ------------------------------------------------------------------ */
    const S = 'Movimientos legales';

    check(S, 'El estado inicial por defecto es [1, 3]',
      game.DEFAULT_STATE.join(',') === '1,3', 'DEFAULT_STATE = ' + game.formatState(game.DEFAULT_STATE));

    states.forEach(function (st) {
      const label = game.formatState(st);
      const moves = game.generateMoves(st);
      const expected = st.reduce(function (a, b) { return a + b; }, 0);
      let ok = moves.length === expected;
      let why = 'movimientos=' + moves.length + ', esperados=' + expected;
      const seen = new Set();

      moves.forEach(function (m) {
        const key = m.row + ':' + m.remove;
        if (seen.has(key)) { ok = false; why = 'movimiento duplicado ' + key; }
        seen.add(key);
        if (!(m.remove >= 1)) { ok = false; why = 'retira ' + m.remove + ' (<1)'; }
        if (m.remove > st[m.row]) { ok = false; why = 'retira más de las que hay en fila ' + (m.row + 1); }
        if (m.next.length !== st.length) { ok = false; why = 'cambia el número de filas'; }
        m.next.forEach(function (v, i) {
          if (!Number.isInteger(v) || v < 0) { ok = false; why = 'estado resultante inválido'; }
          if (i === m.row) {
            if (v !== st[m.row] - m.remove) { ok = false; why = 'fila modificada incorrectamente'; }
          } else if (v !== st[i]) {
            ok = false; why = 'modifica una fila que no es la elegida';
          }
        });
      });
      check(S, 'Todos los movimientos desde ' + label + ' son legales', ok, why);

      // una fila vacía no admite retirar fichas
      const emptyRow = st.map(function () { return 0; });
      const noMoves = game.generateMoves(emptyRow).length === 0;
      check(S, 'Estado vacío ' + game.formatState(emptyRow) + ' no tiene movimientos', noMoves);
    });

    // exploración completa de estados alcanzables desde [1,3]
    (function () {
      const reachable = walkStates(game, [1, 3], 10);
      let ok = true, why = '';
      reachable.forEach(function (st) {
        game.generateMoves(st).forEach(function (m) {
          if (m.remove < 1 || m.remove > st[m.row] || m.next[m.row] !== st[m.row] - m.remove) {
            ok = false; why = 'movimiento ilegal en ' + game.formatState(st);
          }
        });
      });
      check(S, 'Exploración completa de ' + reachable.length + ' estados alcanzables desde [1, 3]', ok, why);
    })();

    /* ------------------------------------------------------------------ *
     * 2) Detección de estados terminales y utilidad                       *
     * ------------------------------------------------------------------ */
    const T = 'Estados terminales';
    check(T, '[0, 0] se detecta como terminal', game.isTerminal([0, 0]) === true);
    check(T, '[0, 0, 0] se detecta como terminal', game.isTerminal([0, 0, 0]) === true);
    check(T, '[1, 3] NO es terminal', game.isTerminal([1, 3]) === false);
    check(T, '[0, 1] NO es terminal', game.isTerminal([0, 1]) === false);
    check(T, '[0, 0] sin movimientos', game.generateMoves([0, 0]).length === 0);
    check(T, 'Utilidad [0,0] con MAX en turno = -1 (MAX pierde)',
      game.utility([0, 0], 'MAX') === -1);
    check(T, 'Utilidad [0,0] con MIN en turno = +1 (MIN pierde)',
      game.utility([0, 0], 'MIN') === 1);
    check(T, 'Utilidad en estado NO terminal = null',
      game.utility([1, 3], 'MAX') === null);

    /* ------------------------------------------------------------------ *
     * 3) Minimax y Alfa-Beta: mismo valor y mismo mejor movimiento        *
     * ------------------------------------------------------------------ */
    const V = 'Minimax vs Alfa-Beta';
    const runs = [];
    states.forEach(function (st) {
      const label = game.formatState(st);
      const cmp = Algorithms.compare(st);
      runs.push({ state: st, cmp: cmp });

      check(V, label + ': mismo valor (Minimax=' + cmp.minimax.value + ', Alfa-Beta=' + cmp.alphabeta.value + ')',
        cmp.sameValue);

      check(V, label + ': mismo mejor movimiento (Minimax=' + game.formatMove(cmp.minimax.bestMove) +
        ', Alfa-Beta=' + game.formatMove(cmp.alphabeta.bestMove) + ')', cmp.sameBestMove);

      // Oráculo independiente: con MAX en turno, gana si y solo si nim-sum != 0
      const oracle = game.nimSum(st) !== 0 ? 1 : -1;
      check(V, label + ': el valor coincide con el oráculo XOR (esperado ' + oracle + ')',
        cmp.minimax.value === oracle && cmp.alphabeta.value === oracle);

      const moves = game.generateMoves(st);
      if (oracle === 1) {
        // posición ganadora: existe al menos un movimiento que deja nim-sum 0
        const winning = moves.filter(function (m) { return game.nimSum(m.next) === 0; });
        check(V, label + ': el mejor movimiento deja nim-sum 0 (jugadas ganadoras: ' +
          winning.map(game.formatMove).join(', ') + ')',
          winning.length >= 1 &&
          moveIn(winning, cmp.minimax.bestMove) &&
          moveIn(winning, cmp.alphabeta.bestMove));
      } else {
        check(V, label + ': estado perdido, se conserva el primer movimiento',
          moveEquals(cmp.minimax.bestMove, moves[0]) && moveEquals(cmp.alphabeta.bestMove, moves[0]));
      }
    });

    /* ------------------------------------------------------------------ *
     * 4) Alfa-Beta no evalúa más nodos que Minimax                       *
     * ------------------------------------------------------------------ */
    const A = 'Eficacia de la poda';
    runs.forEach(function (r) {
      const label = game.formatState(r.state);
      const mm = r.cmp.minimax.stats;
      const ab = r.cmp.alphabeta.stats;
      check(A, label + ': Alfa-Beta evalúa ≤ nodos que Minimax (' + ab.evaluated + ' ≤ ' + mm.evaluated + ')',
        ab.evaluated <= mm.evaluated);
      check(A, label + ': Alfa-Beta visita ≤ nodos que Minimax (' + ab.visited + ' ≤ ' + mm.visited + ')',
        ab.visited <= mm.visited);
      check(A, label + ': Alfa-Beta evalúa ≤ nodos terminales (' + ab.terminals + ' ≤ ' + mm.terminals + ')',
        ab.terminals <= mm.terminals);
      check(A, label + ': nodos podados por Alfa-Beta = ' + ab.pruned + ' (Minimax = ' + mm.pruned + ')',
        ab.pruned >= 0 && mm.pruned === 0);
    });

    (function () {
      const cmp = Algorithms.compare([1, 3]);
      check(A, '[1, 3]: la poda Alfa-Beta descarta ramas reales (' +
        cmp.alphabeta.stats.pruned + ' ramas podadas)', cmp.alphabeta.stats.pruned > 0);
      check(A, '[1, 3]: Alfa-Beta evalúa menos nodos que Minimax (' +
        cmp.alphabeta.stats.evaluated + ' < ' + cmp.minimax.stats.evaluated + ')',
        cmp.alphabeta.stats.evaluated < cmp.minimax.stats.evaluated);
    })();

    /* ------------------------------------------------------------------ *
     * 5) Integridad de la traza (eventos reales de los algoritmos)        *
     * ------------------------------------------------------------------ */
    const I = 'Integridad de la traza';

    function validateTrace(name, run, initial) {
      const byId = new Map();
      const enteredKeys = new Set();
      const skippedKeys = new Set();
      let ok = true;
      let detail = '';
      let rootAssign = null;

      function fail(msg) { ok = false; if (!detail) detail = msg; }

      run.trace.forEach(function (e) {
        if (e.type === 'enter') {
          if (e.parentId === null) {
            if (e.depth !== 0) fail('la raíz no tiene profundidad 0');
            if (e.player !== 'MAX') fail('MAX debe empezar en la raíz, llegó ' + e.player);
            if (e.state.join(',') !== initial.join(',')) fail('la raíz no tiene el estado inicial');
          } else {
            const parent = byId.get(e.parentId);
            if (!parent) { fail('enter sin padre existente (id ' + e.id + ')'); return; }
            if (!parent.moves) { fail('el padre no expandido (id ' + e.parentId + ')'); return; }
            const move = parent.moves[e.moveIndex];
            if (!move) { fail('moveIndex fuera de rango en id ' + e.id); return; }
            if (move.next.join(',') !== e.state.join(',')) fail('estado del hijo no coincide con el movimiento legal');
            if (e.player !== game.other(parent.player)) fail('no se alternan MAX/MIN en id ' + e.id);
            if (e.depth !== parent.depth + 1) fail('la profundidad no aumenta de 1 en 1');
            if (skippedKeys.has(e.parentId + ':' + e.moveIndex)) fail('una rama podada fue explorada (id ' + e.id + ')');
          }
          if (e.player !== (e.depth % 2 === 0 ? 'MAX' : 'MIN')) fail('el turno no corresponde a la profundidad en id ' + e.id);
          enteredKeys.add((e.parentId === null ? 'root' : e.parentId) + ':' + e.moveIndex);
          byId.set(e.id, { player: e.player, depth: e.depth, state: e.state, moves: null });
        } else if (e.type === 'expand') {
          const node = byId.get(e.id);
          if (!node) { fail('expand sin enter previo'); return; }
          node.moves = e.moves;
          if (game.isTerminal(node.state)) fail('un nodo terminal no debe expandirse');
          if (e.moves.length !== node.state.reduce(function (a, b) { return a + b; }, 0)) fail('número de movimientos incoherente');
        } else if (e.type === 'evaluate') {
          const node = byId.get(e.id);
          if (!node) { fail('evaluate sin enter'); return; }
          if (!game.isTerminal(node.state)) fail('evaluate sobre un estado NO terminal');
          if (game.utility(node.state, e.player) !== e.value) fail('utilidad incorrecta en id ' + e.id);
        } else if (e.type === 'assign') {
          const node = byId.get(e.id);
          if (!node) { fail('assign sin enter'); return; }
          if (game.isTerminal(node.state)) fail('assign sobre un estado terminal');
          if (e.value !== -1 && e.value !== 1) fail('valor interno fuera de {-1, +1}');
          if (e.id === 0) rootAssign = e.value;
        } else if (e.type === 'prune') {
          if (!(e.alpha >= e.beta)) fail('podas sin cumplirse α ≥ β');
          e.skipped.forEach(function (m) { skippedKeys.add(e.id + ':' + m.index); });
        }
      });

      const last = run.trace[run.trace.length - 1];
      if (!last || last.type !== 'done') fail('la traza no termina con "done"');
      else {
        if (last.value !== run.value) fail('"done" no coincide con el valor final');
        if (rootAssign !== null && last.value !== rootAssign) fail('"done" no coincide con el valor de la raíz');
        if (!last.bestMove) fail('falta el mejor movimiento');
      }

      // ninguna rama podada debe haberse visitado
      let overlap = false;
      enteredKeys.forEach(function (k) { if (skippedKeys.has(k)) overlap = true; });
      if (overlap) fail('una rama podada aparece también como explorada');

      check(I, name + ' con ' + game.formatState(initial) + ': ' + run.trace.length +
        ' eventos coherentes (turnos, movimientos y utilidad)', ok, detail);
    }

    states.forEach(function (st) {
      validateTrace('Minimax', Algorithms.minimax(st), st);
      validateTrace('Alfa-Beta', Algorithms.alphaBeta(st), st);
    });

    /* ------------------------------------------------------------------ *
     * 6) Orden de exploración obligatorio                                *
     *     1) fila 1 antes que fila 2, 2) retirar 1 antes que 2 (etc.)    *
     *     3) recorrido en profundidad y de izquierda a derecha           *
     * ------------------------------------------------------------------ */
    const O = 'Orden de exploración';

    // 1) orden exacto del caso principal [1, 3]
    (function () {
      const order = game.generateMoves([1, 3]).map(function (m) {
        return 'Fila ' + (m.row + 1) + '→' + m.remove;
      }).join(', ');
      check(O, 'Orden en [1, 3]: Fila 1→1; Fila 2→1, 2 y 3 (la de la fila 1 va primero)',
        order === 'Fila 1→1, Fila 2→1, Fila 2→2, Fila 2→3', 'obtenido: ' + order);
    })();

    // 2) reglas 1 y 2 en todos los estados iniciales
    states.forEach(function (st) {
      const moves = game.generateMoves(st);
      let prevRow = -1, prevRemove = 0, ok = true, why = '';
      moves.forEach(function (m) {
        if (m.row < prevRow) { ok = false; why = 'la fila ' + (m.row + 1) + ' aparece antes que la ' + (prevRow + 1); }
        if (m.row > prevRow) { prevRow = m.row; prevRemove = 0; }
        if (m.remove !== prevRemove + 1) {
          ok = false;
          why = why || ('en la fila ' + (m.row + 1) + ' se espera retirar ' + (prevRemove + 1) + ' y llega ' + m.remove);
        }
        prevRemove = m.remove;
      });
      check(O, game.formatState(st) + ': filas en orden ascendente y cantidades 1, 2, 3… dentro de cada fila',
        ok && moves.length > 0, why || moves.map(function (m) { return 'F' + (m.row + 1) + '→' + m.remove; }).join(', '));
    });

    // 3) regla 3: profundidad + izquierda a derecha en la traza de cada algoritmo
    function validateOrder(name, runByState) {
      let ok = true, detail = '';
      function fail(msg) { if (!detail) detail = msg; ok = false; }

      runByState.forEach(function (run, i) {
        const label = game.formatState(states[i]);
        const stack = [];              // nodos del camino actual (profundidad)
        const lastIdx = new Map();     // parentId -> último moveIndex entrado
        let rootOrder = [];

        run.trace.forEach(function (e) {
          if (e.type === 'enter') {
            if (e.parentId === null || e.parentId === undefined) {
              if (stack.length) fail(label + ': la raíz se entra con el camino no vacío');
              stack.length = 0;
              stack.push(e.id);
            } else {
              if (stack[stack.length - 1] !== e.parentId) {
                fail(label + ': el padre no está en la cima de la pila (no es un recorrido en profundidad)');
              }
              const prev = lastIdx.has(e.parentId) ? lastIdx.get(e.parentId) : -1;
              if (e.moveIndex <= prev) {
                fail(label + ': hijo ' + e.moveIndex + ' visitado después del ' + prev + ' (no es de izquierda a derecha)');
              }
              lastIdx.set(e.parentId, e.moveIndex);
              stack.push(e.id);
              if (e.parentId === 0) rootOrder.push(e.moveIndex);
            }
          } else if (e.type === 'evaluate' || e.type === 'assign') {
            while (stack.length && stack[stack.length - 1] !== e.id) stack.pop();
            if (stack[stack.length - 1] === e.id) stack.pop();
          }
        });

        if (name === 'Minimax' && states[i].join(',') === '1,3') {
          const expected = [0, 1, 2, 3];
          if (rootOrder.join(',') !== expected.join(',')) {
            fail('la raíz de [1, 3] se explora como ' + rootOrder.join(',') + ' y debe ser 0,1,2,3');
          }
        }
      });

      check(O, name + ': recorrido en profundidad y de izquierda a derecha en los ' +
        states.length + ' estados', ok, detail);
    }

    validateOrder('Minimax', states.map(function (st) { return Algorithms.minimax(st); }));
    validateOrder('Alfa-Beta', states.map(function (st) { return Algorithms.alphaBeta(st); }));

    // 4) el primer hijo explorado es el de la izquierda (fila 1, retirar 1)
    (function () {
      let ok = true, detail = '';
      ['minimax', 'alphabeta'].forEach(function (algo) {
        const run = Algorithms.run(algo, [1, 3]);
        const first = run.trace.filter(function (e) { return e.type === 'enter' && e.parentId === 0; })[0];
        if (!first || first.moveIndex !== 0 || first.via.row !== 0 || first.via.remove !== 1) {
          ok = false;
          detail = algo + ': el primer hijo explorado no es Fila 1→1';
        }
      });
      check(O, 'Minimax y Alfa-Beta exploran primero el hijo más a la izquierda (Fila 1 → quitar 1)', ok, detail);
    })();

    /* ------------------------------------------------------------------ *
     * 7) Caso principal [1, 3]                                            *
     * ------------------------------------------------------------------ */
    const M = 'Caso principal [1, 3]';
    const mm = Algorithms.minimax([1, 3]);
    const ab = Algorithms.alphaBeta([1, 3]);
    check(M, 'MAX comienza en [1, 3]', mm.trace[0].type === 'enter' && mm.trace[0].player === 'MAX' && mm.trace[0].depth === 0);
    check(M, 'La utilidad final es +1 (victoria de MAX con juego perfecto)', mm.value === 1 && ab.value === 1);
    check(M, 'Mejor movimiento: fila 2 → quitar 2 (llega a [1, 1])',
      moveEquals(mm.bestMove, { row: 1, remove: 2 }) && moveEquals(ab.bestMove, { row: 1, remove: 2 }),
      game.formatMove(mm.bestMove));
    const prunes = ab.trace.filter(function (e) { return e.type === 'prune'; });
    check(M, 'Alfa-Beta genera al menos una poda, siempre con α ≥ β y ramas descartadas',
      prunes.length > 0 && prunes.every(function (e) { return e.alpha >= e.beta && e.skipped.length > 0; }),
      prunes.length + ' poda(s) registrada(s) en la traza');
    check(M, 'Los turnos alternan correctamente MAX -> MIN -> MAX ...',
      mm.trace.filter(function (e) { return e.type === 'enter'; }).every(function (e) {
        return e.player === (e.depth % 2 === 0 ? 'MAX' : 'MIN');
      }));

    const passed = results.filter(function (r) { return r.pass; }).length;
    return {
      results: results,
      passed: passed,
      failed: results.length - passed,
      total: results.length
    };
  }

  global.NimTests = { run: runAll };

  if (typeof module === 'object' && module.exports) {
    module.exports = global.NimTests;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
