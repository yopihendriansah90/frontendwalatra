import test from 'node:test';
import assert from 'node:assert/strict';
import {coordinates} from '../static/catalog/coordinates.js';

test('Missing coordinates cannot become a pin at zero',()=>{
  for(const missing of [null,undefined,'','   ',false,true,[],{}]){
    assert.equal(coordinates(missing,108),null);
    assert.equal(coordinates(-7,missing),null);
  }
  assert.equal(coordinates(null,null),null);
});

test('Coordinates retain valid zero and numeric API strings, and enforce geographic bounds',()=>{
  assert.deepEqual(coordinates(' -7.3274 ','108.2207'),{lat:-7.3274,lon:108.2207});
  assert.deepEqual(coordinates(0,0),{lat:0,lon:0});
  assert.deepEqual(coordinates(-90,180),{lat:-90,lon:180});
  for(const [lat,lon] of [[90.01,108],[-90.01,108],[-7,180.01],[-7,-180.01],[NaN,108],[-7,Infinity],['abc',108]])assert.equal(coordinates(lat,lon),null);
});
