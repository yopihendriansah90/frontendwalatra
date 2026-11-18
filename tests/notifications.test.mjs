import test from 'node:test';
import assert from 'node:assert/strict';
import {createNotifications} from '../static/catalog/notifications.js';

test('Notifications queue concurrent messages and keep duplicate errors in one dialog',async()=>{
  const calls=[],close=[];
  const notify=createNotifications({fire:options=>{calls.push(options);return new Promise(resolve=>close.push(resolve));}});
  const error={icon:'error',title:'Checkout gagal',text:'Alamat tidak valid. <b>Periksa alamat</b>'};
  const first=notify(error),duplicate=notify(error);
  const second=notify({icon:'info',title:'Pembayaran sedang diproses'});
  assert.equal(first,duplicate);
  await Promise.resolve();
  assert.equal(calls.length,1);
  assert.equal(calls[0].text,error.text);
  assert.equal(calls[0].html,undefined);
  assert.equal(calls[0].confirmButtonColor,'#075446');
  close.shift()({isConfirmed:true});await first;await Promise.resolve();
  assert.equal(calls.length,2);
  close.shift()({isConfirmed:true});await second;
  const repeated=notify(error);await Promise.resolve();
  assert.equal(calls.length,3);
  close.shift()({isConfirmed:true});await repeated;
});

test('Confirmation preserves cancellation and the queue survives a rejected dialog',async()=>{
  let count=0;
  const notify=createNotifications({fire:async options=>{
    if(++count===1)throw new Error('Dialog failed');
    assert.equal(options.showCancelButton,true);
    assert.equal(options.cancelButtonText,'Batal');
    assert.equal(options.customClass.popup,'w-swal-popup');
    return {isConfirmed:false};
  }});
  await assert.rejects(notify({title:'Error'}),/Dialog failed/);
  assert.equal((await notify({title:'Hapus alamat?',showCancelButton:true})).isConfirmed,false);
});
