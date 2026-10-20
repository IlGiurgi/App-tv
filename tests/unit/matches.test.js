'use strict';

var test = require('node:test');
var assert = require('node:assert');
var Matches = require('../../app/js/matches.js');

var HOUR = 3600000;
var NOW = new Date(2026, 9, 19, 16, 0).getTime();

test('parseTerms separa e normalizza le parole da seguire', function () {
  assert.deepStrictEqual(Matches.parseTerms(' Inter, Sinner;F1\nAtlético '), ['inter', 'sinner', 'f1', 'atletico']);
  assert.deepStrictEqual(Matches.parseTerms(''), []);
});

test('findMatches trova i programmi con una parola intera e unisce i canali', function () {
  var sky = { id: '1', name: 'Sky Sport Uno' };
  var skyBk = { id: '2', name: 'Sky Sport Uno (backup)' };
  var dazn = { id: '3', name: 'DAZN 1' };
  var scanned = [
    { channels: [sky, skyBk], epg: [
      { title: 'Serie A: Inter - Milan', start: NOW + 4 * HOUR, end: NOW + 6 * HOUR },
      { title: 'Internazionali di tennis', start: NOW + HOUR, end: NOW + 2 * HOUR },
      { title: 'F1 GP Messico', start: NOW - HOUR, end: NOW + HOUR },
      { title: 'Inter Story', start: NOW - 3 * HOUR, end: NOW - HOUR } // già finito
    ] },
    { channels: [dazn], epg: [
      { title: 'Serie A: Inter - Milan', start: NOW + 4 * HOUR, end: NOW + 6 * HOUR },
      { title: 'Inter - Roma', start: NOW + 72 * HOUR, end: NOW + 74 * HOUR } // troppo lontano
    ] }
  ];
  var found = Matches.findMatches(scanned, Matches.parseTerms('inter, f1'), NOW);
  assert.deepStrictEqual(found.map(function (m) { return m.title; }), ['F1 GP Messico', 'Serie A: Inter - Milan']);
  assert.deepStrictEqual(found[1].channels.map(function (c) { return c.id; }), ['1', '2', '3']);
  assert.strictEqual(Matches.channelNames(found[1]), 'Sky Sport Uno, Sky Sport Uno (backup), DAZN 1');
  assert.deepStrictEqual(Matches.findMatches(scanned, [], NOW), []);
});

test('whenLabel: in onda, oggi, domani, giorno della settimana', function () {
  assert.strictEqual(Matches.whenLabel({ start: NOW - HOUR }, NOW), 'In onda');
  assert.strictEqual(Matches.whenLabel({ start: NOW + 4 * HOUR + 45 * 60000 }, NOW), 'Oggi 20:45');
  assert.strictEqual(Matches.whenLabel({ start: NOW + 26 * HOUR }, NOW), 'Domani 18:00');
  assert.strictEqual(Matches.whenLabel({ start: new Date(2026, 9, 24, 15, 0).getTime() }, NOW), 'Sab 15:00');
});

test('findMatches unisce la stessa partita scritta in modo diverso, ma non due partite diverse alla stessa ora', function () {
  var terms = Matches.parseTerms('champions league, psg');
  var scanned = [
    { channels: [{ id: '1', name: 'Sky' }], epg: [
      { title: 'Champions League: PSG - Barcellona', start: NOW + HOUR, end: NOW + 3 * HOUR },
      { title: 'Champions League: Real - Benfica', start: NOW + HOUR, end: NOW + 3 * HOUR }
    ] },
    { channels: [{ id: '2', name: 'DAZN' }], epg: [
      { title: 'PSG-Barcellona', start: NOW + HOUR + 5 * 60000, end: NOW + 3 * HOUR },
      { title: 'Champions League: Ajax - Napoli', start: NOW + HOUR, end: NOW + 3 * HOUR }
    ] }
  ];
  var found = Matches.findMatches(scanned, terms, NOW);
  assert.strictEqual(found.length, 3);
  var psg = found.filter(function (m) { return /PSG/.test(m.title); })[0];
  assert.deepStrictEqual(psg.channels.map(function (c) { return c.id; }), ['1', '2']);
});
