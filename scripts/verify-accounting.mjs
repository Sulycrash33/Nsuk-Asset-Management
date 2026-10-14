import test from 'node:test';
import assert from 'node:assert/strict';
import { accountingExportRows } from '../src/lib/accounting.ts';
test('financial exports preserve unknowns rather than representing them as zero', () => {
 const rows=accountingExportRows({as_of:'2026-10-14',rows:[{id:'a',barcode:'TEST',name:'Unknown cost',classification:null,category_id:null,unit_name:null,status:'Needs accounting details',model:null,original_cost:null,gross_amount:null,residual_value:null,impairment:null,accumulated_depreciation:null,carrying_amount:null,year_depreciation:null}]});
 assert.equal(rows[0]['Book value (NGN)'],null);
 assert.equal(rows[0]['Original cost (NGN)'],null);
 assert.equal(rows[0].Classification,'Unclassified');
 assert.equal(rows[0]['As of'],'2026-10-14');
});
test('financial exports keep numeric zero and separate measurement bases', () => {
 const rows=accountingExportRows({as_of:'2026-12-31',rows:[{id:'a',barcode:'TEST',name:'Valued',classification:'IT Equipment',category_id:'it',unit_name:'Fixed Assets Unit',status:'Valued',model:'current_value',original_cost:1000,gross_amount:500,residual_value:0,impairment:0,accumulated_depreciation:500,carrying_amount:0,year_depreciation:100}]});
 assert.equal(rows[0]['Original cost (NGN)'],1000);
 assert.equal(rows[0]['Gross amount (NGN)'],500);
 assert.equal(rows[0]['Book value (NGN)'],0);
 assert.equal(rows[0].Model,'current_value');
});

