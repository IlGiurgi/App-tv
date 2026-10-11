/*
 * Dettaglio di un film o di una serie: locandina, trama, pulsanti, stagioni ed episodi.
 */
(function (root) {
  'use strict';

  var h = UI.h;
  var el = root.document.getElementById('screen-detail');
  var posterEl = el.querySelector('.detail-poster');
  var titleEl = el.querySelector('.detail-title');
  var metaEl = el.querySelector('.detail-meta');
  var plotEl = el.querySelector('.detail-plot');
  var actionsEl = el.querySelector('.detail-actions');
  var seasonsEl = el.querySelector('.detail-seasons');
  var episodesEl = el.querySelector('.detail-episodes');

  var state = { item: null, info: null, episodes: {}, season: null, token: 0 };

  function resumeKey(type, id) {
    return type + ':' + id;
  }

  function button(key, label, onSelect) {
    var b = h('div.button.focusable', { 'data-zone': 'detail-actions', 'data-key': key, text: label });
    b.onSelect = onSelect;
    return b;
  }

  function favoriteLabel() {
    return Storage.isFavorite(state.item.type, state.item.id) ? '★ Rimuovi dai preferiti' : '☆ Aggiungi ai preferiti';
  }

  function renderActions() {
    var item = state.item;
    UI.clear(actionsEl);
    if (item.type === 'vod' && state.info) {
      var movie = state.info.movie_data || {};
      var playable = {
        type: 'vod', id: String(movie.stream_id || item.id), name: item.name, icon: item.icon,
        ext: movie.container_extension || item.ext
      };
      var position = Storage.getResume(resumeKey('vod', playable.id));
      if (position) {
        actionsEl.appendChild(button('resume', '▶ Riprendi da ' + UI.formatDuration(position), function () {
          App.show('player', { playlist: [playable], index: 0, startAt: position });
        }));
      }
      actionsEl.appendChild(button('play', position ? '↺ Dall\'inizio' : '▶ Riproduci', function () {
        App.show('player', { playlist: [playable], index: 0, startAt: 0 });
      }));
    }
    var fav = button('fav', favoriteLabel(), function () {
      var added = Storage.toggleFavorite(item);
      fav.textContent = favoriteLabel();
      UI.toast(added ? 'Aggiunto ai preferiti' : 'Rimosso dai preferiti');
    });
    actionsEl.appendChild(fav);
  }

  function renderInfo() {
    var item = state.item;
    var info = (state.info && state.info.info) || {};
    UI.clear(posterEl);
    posterEl.appendChild(UI.img(info.cover_big || info.movie_image || info.cover || item.icon, 'detail-poster-img'));
    titleEl.textContent = info.name || item.name;
    var year = (info.releasedate || info.releaseDate || info.release_date || '').slice(0, 4);
    var meta = [
      year,
      info.genre,
      info.duration,
      (info.rating || item.rating) ? '★ ' + (info.rating || item.rating) : ''
    ].filter(function (part) { return part && String(part).trim(); });
    metaEl.textContent = meta.join('  ·  ');
    plotEl.textContent = info.plot || info.description || '';
  }

  // ---------- Serie: stagioni ed episodi ----------

  function renderSeasons() {
    UI.clear(seasonsEl);
    var seasons = Xtream.sortedSeasonNumbers(state.episodes);
    seasons.forEach(function (season) {
      var seasonEl = h('div.season.focusable', {
        'data-zone': 'detail-seasons', 'data-key': 'season-' + season, text: 'Stagione ' + season
      });
      seasonEl.onFocusIn = function () { selectSeason(season); };
      seasonEl.onSelect = function () { Nav.focusZone('detail-episodes'); };
      seasonsEl.appendChild(seasonEl);
    });
    if (seasons.length) selectSeason(state.season && state.episodes[state.season] ? state.season : seasons[0]);
    else episodesEl.appendChild(h('p.empty', { text: 'Nessun episodio disponibile' }));
  }

  function selectSeason(season) {
    state.season = season;
    Array.prototype.forEach.call(seasonsEl.children, function (s) {
      s.classList.toggle('selected', s.getAttribute('data-key') === 'season-' + season);
    });
    renderEpisodes();
  }

  function renderEpisodes() {
    var seriesName = state.item.name;
    var season = state.season;
    var playlist = (state.episodes[season] || []).map(function (ep) {
      return {
        type: 'episode', id: String(ep.id), ext: ep.container_extension, icon: state.item.icon,
        name: seriesName + ' – S' + season + 'E' + ep.episode_num + (ep.title ? ' · ' + stripPrefix(ep.title, seriesName) : ''),
        duration: (ep.info && ep.info.duration_secs) || 0,
        label: ep.episode_num + '. ' + stripPrefix(ep.title || 'Episodio ' + ep.episode_num, seriesName),
        durationText: (ep.info && ep.info.duration) || ''
      };
    });
    Nav.forgetZone('detail-episodes');
    UI.clear(episodesEl);
    episodesEl.scrollTop = 0;
    playlist.forEach(function (episode, index) {
      var position = Storage.getResume(resumeKey('episode', episode.id));
      var progress = position && episode.duration ? Math.min(100, position / episode.duration * 100) : 0;
      var epEl = h('div.episode.focusable', { 'data-zone': 'detail-episodes', 'data-key': 'episode-' + episode.id }, [
        h('span.episode-title', { text: episode.label }),
        h('span.episode-duration', { text: position ? 'ripresa da ' + UI.formatDuration(position) : episode.durationText }),
        progress ? h('span.episode-progress', { style: 'width:' + progress.toFixed(1) + '%' }) : null
      ]);
      epEl.onSelect = function () {
        App.show('player', { playlist: playlist, index: index, startAt: position });
      };
      episodesEl.appendChild(epEl);
    });
  }

  /** Molti provider ripetono il nome della serie nel titolo dell'episodio. */
  function stripPrefix(title, seriesName) {
    var t = String(title || '');
    return t.indexOf(seriesName) === 0 ? t.slice(seriesName.length).replace(/^[\s\-–:|]+/, '') || t : t;
  }

  // ---------- Caricamento ----------

  function load() {
    var item = state.item;
    var token = ++state.token;
    var request = item.type === 'vod' ? App.client.getVodInfo(item.id) : App.client.getSeriesInfo(item.id);
    UI.withLoader(request).then(function (info) {
      if (token !== state.token) return;
      state.info = info || {};
      state.episodes = (info && info.episodes) || {};
      renderInfo();
      renderActions();
      if (item.type === 'series') renderSeasons();
      Nav.focusFirst();
    }, function (err) {
      if (token !== state.token) return;
      UI.toast('Errore: ' + err.message);
      renderActions();
      Nav.focusFirst();
    });
  }

  /** Dopo un re-render, rimette il focus sull'elemento equivalente (stesso data-key). */
  function refocus(key) {
    var target = key && el.querySelector('[data-key="' + key + '"]');
    if (target) Nav.focus(target);
    else Nav.focusFirst();
  }

  App.register('detail', {
    el: el,
    enter: function (params) {
      state.item = params.item;
      state.info = null;
      state.episodes = {};
      state.season = null;
      el.classList.toggle('is-series', state.item.type === 'series');
      UI.clear(seasonsEl);
      UI.clear(episodesEl);
      renderInfo();
      renderActions();
      Nav.focusFirst();
      load();
    },
    resume: function () {
      // Aggiorna le posizioni di ripresa dopo la visione.
      var key = this.lastFocus && this.lastFocus.getAttribute('data-key');
      renderActions();
      // Dopo aver visto parte del film, il pulsante più utile è "Riprendi".
      if (key === 'play' && actionsEl.querySelector('[data-key="resume"]')) key = 'resume';
      if (state.item.type === 'series' && state.season) renderEpisodes();
      this.lastFocus = null;
      refocus(key);
    },
    handleKey: function (action) {
      if (action === 'red') {
        var fav = actionsEl.querySelector('[data-key="fav"]');
        if (fav) fav.onSelect();
        return true;
      }
      return false;
    }
  });
})(this);
