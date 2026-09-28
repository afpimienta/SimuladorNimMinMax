/**
 * game.js — Lógica pura del juego de Nim.
 * ---------------------------------------------------------------------------
 * No toca el DOM ni depende de ningún otro módulo. Es el "modelo" del juego:
 * representación de estados, generación de movimientos, detección de estados
 * terminales y la función de utilidad (+1 victoria de MAX, -1 victoria de MIN).
 *
 * Representación de un estado: array de enteros no negativos.
 *   [1, 3]  =>  fila 1 con 1 ficha, fila 2 con 3 fichas.
 *
 * Reglas (Nim normal / misère no aplica: gana quien retira la última ficha):
 *   - En un turno se retiran una o más fichas de UNA SOLA fila.
 *   - No se pueden pasar el turno ni añadir fichas.
 *   - Gana quien retira la última ficha (el jugador que queda sin movimiento pierde).
 */
(function (global) {
  'use strict';

  /** Estado inicial obligatorio de la aplicación. */
  const DEFAULT_STATE = [1, 3];

  /** Comprobación de que un valor es un estado de Nim válido. */
  function isState(state) {
    return (
      Array.isArray(state) &&
      state.length > 0 &&
      state.every(function (n) { return Number.isInteger(n) && n >= 0; })
    );
  }

  /** Un estado es terminal cuando no queda ninguna ficha en el tablero. */
  function isTerminal(state) {
    return isState(state) && state.every(function (n) { return n === 0; });
  }

  /**
   * Genera TODOS los movimientos legales desde `state`.
   *
   * RESPETA EL ORDEN DE EXPLORACIÓN OBLIGATORIO:
   *   1) primero los movimientos sobre la FILA 1 y después los de la FILA 2 (y
   *      así con el resto, de arriba abajo);
   *   2) dentro de una misma fila, primero retirar 1 ficha, después 2, después
   *      3 y así sucesivamente (cantidad creciente).
   *
   * Ese orden determinista es el que consumen Minimax y Alfa-Beta (recorrido en
   * profundidad y de izquierda a derecha), de modo que ambos recorren el mismo
   * árbol y la poda siempre descarta las ramas hermanas de la derecha.
   *
   * @returns {Array<{row:number, remove:number, next:number[], label:string}>}
   */
  function generateMoves(state) {
    const moves = [];
    if (!isState(state) || isTerminal(state)) return moves;

    for (let row = 0; row < state.length; row++) {            // fila 1, luego fila 2…
      for (let remove = 1; remove <= state[row]; remove++) {   // 1, 2, 3… fichas
        const next = state.slice();
        next[row] = state[row] - remove;
        moves.push({
          row: row,
          remove: remove,
          next: next,
          label: 'Fila ' + (row + 1) + ': quitar ' + remove + ' ficha' + (remove > 1 ? 's' : '')
        });
      }
    }
    return moves;
  }

  /**
   * Función de utilidad. SOLO tiene sentido en estados terminales:
   *   +1 => ha ganado MAX  (MIN estaba en turno y no pudo mover)
   *   -1 => ha ganado MIN  (MAX estaba en turno y no pudo mover)
   * En estados no terminales devuelve null.
   */
  function utility(state, playerToMove) {
    if (!isTerminal(state)) return null;
    return playerToMove === 'MAX' ? -1 : 1;
  }

  /** Ganador en un estado terminal, dado el jugador que tendría que mover. */
  function winner(state, playerToMove) {
    const u = utility(state, playerToMove);
    if (u === null) return null;
    return u === 1 ? 'MAX' : 'MIN';
  }

  /** El jugador contrario. */
  function other(player) {
    return player === 'MAX' ? 'MIN' : 'MAX';
  }

  /** Suma XOR de las filas (oráculo independiente para las pruebas). */
  function nimSum(state) {
    return state.reduce(function (acc, n) { return acc ^ n; }, 0);
  }

  /** Texto legible de un estado: "[1, 3]". */
  function formatState(state) {
    return '[' + state.join(', ') + ']';
  }

  /** Describe un movimiento: {row, remove} -> texto. */
  function formatMove(move) {
    if (!move) return '—';
    return 'Fila ' + (move.row + 1) + ' → quitar ' + move.remove;
  }

  /**
   * Estados pequeños seleccionables. [1, 3] es el caso principal y va primero.
   */
  const PRESETS = [
    { id: '1-3', label: '[1, 3]', state: [1, 3], main: true, note: 'Caso principal · MAX comienza' },
    { id: '1-1', label: '[1, 1]', state: [1, 1], note: 'Simetría simple' },
    { id: '1-2', label: '[1, 2]', state: [1, 2], note: 'Poda temprana' },
    { id: '2-2', label: '[2, 2]', state: [2, 2], note: 'Dos filas parecidas' },
    { id: '2-3', label: '[2, 3]', state: [2, 3], note: 'Árbol un poco mayor' },
    { id: '1-1-1', label: '[1, 1, 1]', state: [1, 1, 1], note: 'Tres filas' }
  ];

  global.NimGame = {
    DEFAULT_STATE: DEFAULT_STATE,
    PRESETS: PRESETS,
    isState: isState,
    isTerminal: isTerminal,
    generateMoves: generateMoves,
    utility: utility,
    winner: winner,
    other: other,
    nimSum: nimSum,
    formatState: formatState,
    formatMove: formatMove
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = global.NimGame;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
