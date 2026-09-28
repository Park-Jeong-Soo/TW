const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('pdf_english_reviewer/demo.js', 'utf8');
const code = source.replace(/\}\)\(\);\s*$/, 'globalThis.testApi={getRules,visibleFindings,viewerState};})();');
assert.notEqual(code, source);
const data = new Map([['tw-demo-rules-v4', JSON.stringify([
  {id:'chicago-03-intro-clause'}, {id:'chicago-08-define-abbrev'},
  {id:'chicago-14-consistent-compound'}, {id:'custom',enabled:false}
])]]);
const elements = new Map();
const context = {console, window:{}, document:{head:{appendChild(){}}, createElement(){return{}},
  addEventListener(){}, getElementById(id){return elements.get(id)||null}},
  localStorage:{getItem(k){return data.get(k)||null},setItem(k,v){data.set(k,v)},removeItem(k){data.delete(k)}}};
vm.runInNewContext(code,context);
const rules=context.testApi.getRules();
assert.equal(rules.length,6);
assert.equal(rules.filter(r=>/^chicago-2[1-5]-/.test(r.id)).length,5);
assert.equal(rules.find(r=>r.id==='custom').enabled,false);
assert.equal(context.testApi.getRules().length,6);
for(const [id,input,expected] of [
  ['chicago-21-colon-space','Note:Check','Note: Check'],
  ['chicago-22-em-dash-space','one — two','one—two'],
  ['chicago-23-decimal-zero','.75 mm','0.75 mm'],
  ['chicago-24-number-range','pages 10-12','pages 10–12'],
  ['chicago-25-us-abbreviation','U.S. manual','US manual']]){
  const r=rules.find(x=>x.id===id);
  assert.equal(input.replace(new RegExp(r.pattern,r.flags),r.replacement),expected,id);
}
elements.set('category-filter',{value:'all'});
elements.set('issue-search',{value:'9.62'});
context.testApi.viewerState.findings=[
  {ruleName:'Chicago 9.62',category:'numbers_abbreviations'},
  {ruleName:'Chicago 6.66',category:'punctuation'}];
assert.equal(context.testApi.visibleFindings().length,1);
elements.get('issue-search').value='Team Manual Standard';
assert.equal(context.testApi.visibleFindings().length,2);
const appSource=require('node:fs').readFileSync('pdf_english_reviewer/app_v3.js','utf8');
const start=appSource.indexOf('function visibleIssues() {');
const end=appSource.indexOf('\nfunction canImportIssueAsTeamCandidate',start);
assert.ok(start>=0&&end>start);
const appElements=new Map([
  ['category-filter',{value:'all'}],['engine-filter',{value:'all'}],
  ['standard-filter',{value:'all'}],['issue-search',{value:'6.66'}]]);
const appContext={
  $:(id)=>appElements.get(id),
  reviewVisibleIssueSource:()=>[
    {status:'pending',rule_id:'Chicago 6.66',standard:'Team Manual Standard',page:1},
    {status:'pending',rule_id:'Chicago 9.62',standard:'Team Manual Standard',page:2}],
  issueY:()=>0,severityRank:()=>0};
vm.runInNewContext(appSource.slice(start,end)+'\nglobalThis.visibleIssues=visibleIssues;',appContext);
assert.equal(appContext.visibleIssues().length,1);
appElements.get('issue-search').value='Team Manual Standard';
assert.equal(appContext.visibleIssues().length,2);
console.log('migration, rules, search: passed');
