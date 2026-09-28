/**
 * script.js — Orquestación de la aplicación (sin lógica de juego ni de árbol).
 * ---------------------------------------------------------------------------
 * Conecta los controles con:
 *   - algorithms.run()      -> traza real de eventos,
 *   - Viz.buildModel()      -> modelo de vista a partir de esa traza,
 *   - Viz.render*()         -> pintado de tablero, árbol y paneles.
 *
 * La animación NUNCA se simula: cada paso avanza sobre la traza real emitida
 * por Minimax o por Alfa-Beta.
 */
(function () {
  'use strict';

  const $ = function (sel) { return document.querySelector(sel); };
  const PLAY_MS = 850;

  const app = {
    algo: 'minimax',
    presetId: '1-3',
    run: null,
    model: null,
    zoom: 1,
    index: 0,
    playing: false,
    timer: null
  };

  /* ------------------------------------------------------------------ *
   *  Utilidades                                                         *
   * ------------------------------------------------------------------ */
  function currentPreset() {
    const list = window.NimGame.PRESETS;
    for (let i = 0; i < list.length; i++) if (list[i].id === app.presetId) return list[i];
    return list[0];
  }

  function isAlphaBeta() {
    return app.algo === window.Algorithms.ALPHABETA;
  }

  /* ------------------------------------------------------------------ *
   *  Carga de una ejecución (cambio de algoritmo o de estado inicial)   *
   * ------------------------------------------------------------------ */
  function loadRun() {
    stopPlayback();
    const p = currentPreset();
    app.run = window.Algorithms.run(app.algo, p.state);
    app.index = 0;

    const scrub = $('#scrub');
    scrub.max = String(Math.max(0, app.run.trace.length - 1));
    scrub.value = '0';

    render();
  }

  /* ------------------------------------------------------------------ *
   *  Render principal                                                   *
   * ------------------------------------------------------------------ */
  function render() {
    const Viz = window.Viz;
    const model = Viz.layout(Viz.buildModel(app.run.trace, app.index));
    app.model = model;
    const evt = model.lastEvent;

    // --- árbol (conservamos la posición de scroll para que no salte) ----
    const scrollEl = $('#treeScroll');
    const canvas = $('#treeCanvas');
    const keepLeft = scrollEl.scrollLeft;
    const keepTop = scrollEl.scrollTop;
    Viz.renderTree(canvas, model, { isAlphaBeta: isAlphaBeta(), zoom: app.zoom });
    scrollEl.scrollLeft = keepLeft;
    scrollEl.scrollTop = keepTop;

    // --- nodo actual -> tablero ----------------------------------------
    let node = model.currentId !== null ? model.byId.get(model.currentId) : null;
    if (!node && model.rootId !== null) node = model.byId.get(model.rootId);
    const state = node ? node.state : app.run.initialState;
    const player = node ? node.player : 'MAX';
    const terminal = state.every(function (n) { return n === 0; });

    let note;
    if (terminal) {
      const winner = player === 'MAX' ? 'MIN' : 'MAX';
      note = 'Sin movimientos posibles: <strong>' + player + '</strong> pierde y gana <strong>' + winner + '</strong>.';
    } else if (model.done && model.stack.length === 0) {
      note = 'La búsqueda ha vuelto a la <strong>raíz</strong>: valor final <strong>' +
        Viz.fmtValue(model.done.value) + '</strong>' +
        (model.done.bestMove ? ' · mejor movimiento de MAX: <strong>' +
          window.NimGame.formatMove(model.done.bestMove) + '</strong>' : '') + '.';
    } else if (node && node.via) {
      note = 'Entrada a este estado con: <strong>' + node.via.label + '</strong>.';
    } else {
      note = '<strong>MAX</strong> comienza la partida con ' + Viz.fmtState(state) + '.';
    }

    Viz.renderBoard($('#board'), state, { player: player, lastMove: node && node.via ? node.via : null, note: note });

    // --- paneles --------------------------------------------------------
    Viz.renderEducational($('#edu'), {
      event: evt,
      model: model,
      index: app.index,
      total: app.run.trace.length,
      isAlphaBeta: isAlphaBeta()
    });
    Viz.renderStats($('#stats'), { stats: model.stats, done: model.done });

    $('#stepLabel').textContent = 'Paso ' + (app.index + 1) + ' / ' + app.run.trace.length;
    $('#scrub').value = String(app.index);
    $('#boardState').textContent = Viz.fmtState(state);
    $('#treeAlgo').textContent = app.run.label + ' · ' + Viz.fmtState(app.run.initialState) +
      (isAlphaBeta() ? ' · con poda' : ' · sin poda');

    updateButtons();
    updateZoomUI();
    Viz.focusCurrent(scrollEl, canvas, model, app.zoom);
  }

  function updateButtons() {
    const last = app.run.trace.length - 1;
    $('#btnPrev').disabled = app.index <= 0;
    $('#btnNext').disabled = app.index >= last;
    $('#btnPlay').disabled = app.playing || app.index >= last;
    $('#btnPause').disabled = !app.playing;
    $('#btnReset').disabled = app.index <= 0 && !app.playing;
    $('#scrub').disabled = false;
  }

  /* ------------------------------------------------------------------ *
   *  Zoom del árbol de búsqueda                                         *
   * ------------------------------------------------------------------ */
  function setZoom(z) {
    const Viz = window.Viz;
    const next = Viz.clampZoom(z);
    if (next === app.zoom) return;      // ya estamos en el límite
    app.zoom = next;
    render();
    // el zoom cambia las coordenadas pintadas: recentramos el nodo actual
    Viz.focusCurrent($('#treeScroll'), $('#treeCanvas'), app.model, app.zoom, true);
  }

  function updateZoomUI() {
    const Viz = window.Viz;
    $('#zoomLevel').textContent = Math.round(app.zoom * 100) + ' %';
    $('#zoomOut').disabled = app.zoom <= Viz.ZOOM_MIN;
    $('#zoomIn').disabled = app.zoom >= Viz.ZOOM_MAX;
    $('#zoomReset').disabled = app.zoom === 1;
  }

  /* ------------------------------------------------------------------ *
   *  Navegación paso a paso                                             *
   * ------------------------------------------------------------------ */
  function goTo(index) {
    const last = app.run.trace.length - 1;
    app.index = Math.min(Math.max(0, index), last);
    render();
  }

  function next() {
    if (app.index < app.run.trace.length - 1) goTo(app.index + 1);
    else stopPlayback();
  }

  function prev() {
    if (app.index > 0) goTo(app.index - 1);
  }

  function reset() {
    stopPlayback();
    goTo(0);
    const scrollEl = $('#treeScroll');
    scrollEl.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
  }

  function startPlayback() {
    if (app.playing || app.index >= app.run.trace.length - 1) return;
    app.playing = true;
    app.timer = window.setInterval(function () {
      if (app.index >= app.run.trace.length - 1) {
        stopPlayback();
        return;
      }
      goTo(app.index + 1);
    }, PLAY_MS);
    updateButtons();
  }

  function stopPlayback() {
    if (app.timer) window.clearInterval(app.timer);
    app.timer = null;
    app.playing = false;
    if (app.run) updateButtons();
  }

  /* ------------------------------------------------------------------ *
   *  Controles                                                          *
   * ------------------------------------------------------------------ */
  function buildPresetButtons() {
    const html = window.NimGame.PRESETS.map(function (p) {
      return '<button class="preset' + (p.main ? ' is-main' : '') + (p.id === app.presetId ? ' is-active' : '') +
        '" type="button" data-preset="' + p.id + '" aria-pressed="' + (p.id === app.presetId) + '">' +
        '<span class="preset__label">' + p.label + '</span>' +
        (p.main ? '<span class="preset__tag">principal</span>' : '') +
        (p.note && !p.main ? '<span class="preset__note">' + p.note + '</span>' : '') +
        '</button>';
    }).join('');
    $('#presets').innerHTML = html;
  }

  function wireControls() {
    // algoritmo
    Array.prototype.forEach.call(document.querySelectorAll('.seg__btn'), function (btn) {
      btn.addEventListener('click', function () {
        if (btn.dataset.algo === app.algo) return;
        app.algo = btn.dataset.algo;
        Array.prototype.forEach.call(document.querySelectorAll('.seg__btn'), function (b) {
          const active = b.dataset.algo === app.algo;
          b.classList.toggle('is-active', active);
          b.setAttribute('aria-selected', String(active));
        });
        loadRun();
      });
    });

    // estados iniciales
    $('#presets').addEventListener('click', function (ev) {
      const btn = ev.target.closest('.preset');
      if (!btn) return;
      if (btn.dataset.preset === app.presetId) return;
      app.presetId = btn.dataset.preset;
      Array.prototype.forEach.call(document.querySelectorAll('.preset'), function (b) {
        const active = b.dataset.preset === app.presetId;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      loadRun();
    });

    // reproducción
    $('#btnNext').addEventListener('click', function () { stopPlayback(); next(); });
    $('#btnPrev').addEventListener('click', function () { stopPlayback(); prev(); });
    $('#btnReset').addEventListener('click', reset);
    $('#btnPlay').addEventListener('click', startPlayback);
    $('#btnPause').addEventListener('click', stopPlayback);

    $('#scrub').addEventListener('input', function (e) {
      stopPlayback();
      goTo(parseInt(e.target.value, 10) || 0);
    });

    // zoom del árbol
    $('#zoomIn').addEventListener('click', function () { setZoom(app.zoom + window.Viz.ZOOM_STEP); });
    $('#zoomOut').addEventListener('click', function () { setZoom(app.zoom - window.Viz.ZOOM_STEP); });
    $('#zoomReset').addEventListener('click', function () { setZoom(1); });

    // teclado (← → avanzan, espacio reproduce/pausa; no intercepta cuando el
    // foco está en un control nativo, para respetar su comportamiento por defecto)
    document.addEventListener('keydown', function (e) {
      const tag = (e.target.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select', 'button', 'a'].indexOf(tag) !== -1) return;
      if (e.key === 'ArrowRight') { stopPlayback(); next(); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { stopPlayback(); prev(); e.preventDefault(); }
      else if (e.key === ' ') { app.playing ? stopPlayback() : startPlayback(); e.preventDefault(); }
    });
  }

  /* ------------------------------------------------------------------ *
   *  Arranque                                                           *
   * ------------------------------------------------------------------ */
  function init() {
    buildPresetButtons();
    wireControls();
    loadRun();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
