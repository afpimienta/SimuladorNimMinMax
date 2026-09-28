/**
 * algorithms.js — Minimax y Poda Alfa-Beta sobre el juego de Nim.
 * ---------------------------------------------------------------------------
 * Implementación REAL (nada está hardcodeado): el árbol se genera a partir de
 * NimGame.generateMoves y los dos algoritmos recorren el mismo árbol.
 *
 * Cada algoritmo emite una TRAZA (trace) de eventos que la visualización
 * consume. Así la animación refleja fielmente la ejecución real:
 *
 *   enter   -> el algoritmo desciende/visita un nodo
 *   expand  -> se generan los movimientos legales del nodo (padre de sus hijos)
 *   evaluate-> nodo terminal: se aplica la función de utilidad (+1 / -1)
 *   bound   -> tras evaluar un hijo, el padre actualiza su mejor valor (y α/β)
 *   prune   -> Alfa-Beta: α >= β, se descartan las ramas restantes
 *   assign  -> el nodo queda con su valor definitivo
 *   done    -> fin de la búsqueda: valor final y mejor movimiento de MAX
 *
 * El estado NO se modifica nunca: los estados se clonan en cada movimiento.
 */
(function (global) {
  'use strict';

  const NAME_MINIMAX = 'minimax';
  const NAME_ALPHABETA = 'alphabeta';

  function G() {
    if (!global.NimGame) throw new Error('game.js debe cargarse antes que algorithms.js');
    return global.NimGame;
  }

  /** Formatea un límite de la ventana (soporta ±Infinity). */
  function fmtBound(v) {
    if (v === Infinity) return '∞';
    if (v === -Infinity) return '-∞';
    return String(v);
  }

  function newStats() {
    return {
      visited: 0,      // nodos que el algoritmo entró a explorar
      evaluated: 0,    // nodos a los que se les asignó un valor (terminales + internos)
      terminals: 0,    // nodos terminales evaluados con la utilidad
      pruned: 0,       // ramas descartadas por poda
      generated: 0,    // movimientos legales generados
      maxDepth: 0      // profundidad máxima alcanzada
    };
  }

  /**
   * Motor compartido. `useAlphaBeta` decide si se aplica la poda.
   * Devuelve { name, trace, stats, value, bestMove, rootMoves }.
   */
  function search(initialState, useAlphaBeta) {
    const game = G();
    if (!game.isState(initialState)) throw new Error('Estado inicial inválido');

    const trace = [];
    const stats = newStats();
    let idCounter = 0;
    let rootMoves = null;

    function emit(event) {
      event.seq = trace.length;
      trace.push(event);
    }

    function rec(state, player, depth, parentId, moveIndex, via, alpha, beta) {
      const id = idCounter++;
      stats.visited++;
      if (depth > stats.maxDepth) stats.maxDepth = depth;

      emit({
        type: 'enter',
        id: id,
        state: state.slice(),
        player: player,
        depth: depth,
        parentId: parentId,
        moveIndex: moveIndex,
        via: via ? {
          row: via.row,
          remove: via.remove,
          label: via.label || ('Fila ' + (via.row + 1) + ': quitar ' + via.remove)
        } : null,
        alpha: useAlphaBeta ? alpha : null,
        beta: useAlphaBeta ? beta : null
      });

      // --- Nodo terminal: se aplica la función de utilidad -----------------
      if (game.isTerminal(state)) {
        const value = game.utility(state, player);
        stats.terminals++;
        stats.evaluated++;
        emit({
          type: 'evaluate', id: id, value: value, player: player, depth: depth,
          reason: 'terminal',
          alpha: useAlphaBeta ? alpha : null,
          beta: useAlphaBeta ? beta : null
        });
        return { id: id, value: value };
      }

      // --- Expansión: movimientos legales reales ---------------------------
      const moves = game.generateMoves(state);
      stats.generated += moves.length;
      if (depth === 0) rootMoves = moves;
      emit({
        type: 'expand',
        id: id,
        player: player,
        depth: depth,
        moves: moves.map(function (m) {
          return { row: m.row, remove: m.remove, next: m.next.slice(), label: m.label };
        }),
        alpha: useAlphaBeta ? alpha : null,
        beta: useAlphaBeta ? beta : null
      });

      let best = player === 'MAX' ? -Infinity : Infinity;
      let bestIndex = -1;

      // Recorrido en PROFUNDIDAD y de IZQUIERDA A DERECHA: se visitan los
      // movimientos en su orden de generación (fila 1 antes que fila 2 y, en
      // la misma fila, retirar 1 antes que 2), es decir, los hijos de la
      // izquierda (moveIndex creciente) antes que los de la derecha.
      for (let i = 0; i < moves.length; i++) {
        const child = rec(
          moves[i].next,
          player === 'MAX' ? 'MIN' : 'MAX',
          depth + 1,
          id,
          i,
          moves[i],
          alpha,
          beta
        );

        // MAX se queda con el máximo, MIN con el mínimo (estricto => primer mejor)
        if (player === 'MAX' ? child.value > best : child.value < best) {
          best = child.value;
          bestIndex = i;
        }

        if (useAlphaBeta) {
          if (player === 'MAX') alpha = Math.max(alpha, best);
          else beta = Math.min(beta, best);
        }

        emit({
          type: 'bound',
          id: id,
          player: player,
          value: best,
          childIndex: i,
          childId: child.id,
          childValue: child.value,
          alpha: useAlphaBeta ? alpha : null,
          beta: useAlphaBeta ? beta : null
        });

        // --- Poda Alfa-Beta: la ventana se cierra ---------------------------
        if (useAlphaBeta && alpha >= beta) {
          const skipped = moves.slice(i + 1);
          if (skipped.length > 0) {
            stats.pruned += skipped.length;
            emit({
              type: 'prune',
              id: id,
              player: player,
              childId: child.id,
              fromIndex: i,
              skipped: skipped.map(function (m, k) {
                return { index: i + 1 + k, row: m.row, remove: m.remove, next: m.next.slice(), label: m.label };
              }),
              alpha: alpha,
              beta: beta,
              condition: 'α ≥ β (' + fmtBound(alpha) + ' ≥ ' + fmtBound(beta) + ')'
            });
          }
          break;
        }
      }

      stats.evaluated++;
      emit({
        type: 'assign',
        id: id,
        player: player,
        depth: depth,
        value: best,
        bestChildIndex: bestIndex,
        alpha: useAlphaBeta ? alpha : null,
        beta: useAlphaBeta ? beta : null
      });

      return { id: id, value: best, bestIndex: bestIndex };
    }

    const result = rec(initialState, 'MAX', 0, null, 0, null, -Infinity, Infinity);
    const bestMove = rootMoves && result.bestIndex >= 0 ? rootMoves[result.bestIndex] : null;

    emit({
      type: 'done',
      value: result.value,
      bestMove: bestMove ? { row: bestMove.row, remove: bestMove.remove, next: bestMove.next.slice(), label: bestMove.label } : null,
      visited: stats.visited,
      evaluated: stats.evaluated,
      terminals: stats.terminals,
      pruned: stats.pruned,
      maxDepth: stats.maxDepth
    });

    return {
      name: useAlphaBeta ? NAME_ALPHABETA : NAME_MINIMAX,
      label: useAlphaBeta ? 'Alfa-Beta' : 'Minimax',
      trace: trace,
      stats: stats,
      value: result.value,
      bestMove: bestMove ? { row: bestMove.row, remove: bestMove.remove, next: bestMove.next.slice(), label: bestMove.label } : null,
      initialState: initialState.slice()
    };
  }

  /** Minimax clásico (sin poda). */
  function minimax(state) {
    return search(state, false);
  }

  /** Minimax + poda Alfa-Beta. */
  function alphaBeta(state) {
    return search(state, true);
  }

  /** Ejecuta ambos algoritmos sobre el mismo estado (para compararlos). */
  function compare(state) {
    const mm = minimax(state);
    const ab = alphaBeta(state);
    return {
      minimax: mm,
      alphabeta: ab,
      sameValue: mm.value === ab.value,
      sameBestMove:
        !!mm.bestMove && !!ab.bestMove &&
        mm.bestMove.row === ab.bestMove.row &&
        mm.bestMove.remove === ab.bestMove.remove,
      reduction:
        mm.stats.evaluated > 0
          ? (mm.stats.evaluated - ab.stats.evaluated) / mm.stats.evaluated
          : 0
    };
  }

  /** Ejecuta un algoritmo por nombre: 'minimax' | 'alphabeta'. */
  function run(name, state) {
    return name === NAME_ALPHABETA ? alphaBeta(state) : minimax(state);
  }

  global.Algorithms = {
    MINIMAX: NAME_MINIMAX,
    ALPHABETA: NAME_ALPHABETA,
    fmtBound: fmtBound,
    minimax: minimax,
    alphaBeta: alphaBeta,
    compare: compare,
    run: run
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = global.Algorithms;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
