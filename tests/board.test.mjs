import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Board } = require('../src/agent/board.js');

test('image references become the stored image', () => {
  const b = new Board();
  const id = b.addImage('data:image/png;base64,AA');
  assert.equal(b.set('Notes', `<img src="${id}" alt="x">`), '<img src="data:image/png;base64,AA" alt="x">');
});

test('unknown image references and remote sources are left alone', () => {
  const b = new Board();
  assert.equal(b.set('Notes', '<img src="image:9"><img src="http://a.com/x.png">'), '<img src="image:9"><img src="http://a.com/x.png">');
});

test('a new board renames an empty page instead of leaving a blank in the history', () => {
  const b = new Board();
  b.newPage('Pricing');
  assert.equal(b._pages.length, 1);
  b.set('Notes', 'x');
  b.newPage('Security');
  assert.equal(b._pages.length, 2);
});

test('sections belong to their page', () => {
  const b = new Board();
  b.set('Notes', 'x');
  b.newPage('Second');
  assert.equal(b.remove('Notes'), false);
});

test('a new board needs a title, and clearing starts over', () => {
  const b = new Board();
  assert.throws(() => b.newPage('  '));
  b.set('Notes', 'x');
  b.newPage('Second');
  b.clear();
  assert.equal(b._pages.length, 1);
});
