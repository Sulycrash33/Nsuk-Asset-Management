import test from 'node:test';
import assert from 'node:assert/strict';
import { accountingExportRows, selectAccountingReport } from '../src/lib/accounting.ts';

function draftReport(amount) {
 return {as_of:'2026-10-15',rows:[],asset_count:1,valued_count:1,incomplete_count:0,original_cost:1000,depreciation:1000-amount,impairment:0,carrying_amount:amount,year_depreciation:1000-amount};
}

test('draft totals refresh after a financial post without becoming a finalized snapshot', () => {
 const before = selectAccountingReport(draftReport(900), [], null);
 const after = selectAccountingReport(draftReport(750), [], null);
 assert.equal(before.report.carrying_amount, 900);
 assert.equal(after.report.carrying_amount, 750);
 assert.equal(after.finalized, false);
});

test('explicit annual snapshot stays selected across draft refreshes and can return to the latest draft', () => {
 const snapshot = {...draftReport(800),as_of:'2025-12-31'};
 const saved = [{id:'annual-2025',snapshot}];
 const refreshed = draftReport(650);
 const selected = selectAccountingReport(refreshed, saved, 'annual-2025');
 assert.equal(selected.report.as_of, '2025-12-31');
 assert.equal(selected.report.carrying_amount, 800);
 assert.equal(selected.finalized, true);
 assert.equal(selectAccountingReport(refreshed, saved, null).report.carrying_amount, 650);
 assert.equal(selectAccountingReport(refreshed, [], 'annual-2025').finalized, false);
});
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


