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
assert.equal(rules.length,16);
assert.equal(rules.filter(r=>/^chicago-2[1-5]-/.test(r.id)).length,5);
assert.equal(rules.filter(r=>/^chicago-(?:2[6-9]|3[0-5])-/.test(r.id)).length,10);
assert.equal(rules.find(r=>r.id==='custom').enabled,false);
assert.equal(context.testApi.getRules().length,16);
for(const [id,input,expected] of [
  ['chicago-21-colon-space','Note:Check','Note: Check'],
  ['chicago-22-em-dash-space','one — two','one—two'],
  ['chicago-23-decimal-zero','.75 mm','0.75 mm'],
  ['chicago-24-number-range','pages 10-12','pages 10–12'],
  ['chicago-25-us-abbreviation','U.S. manual','US manual'],
  ['chicago-26-date-day-comma','September 28 2026','September 28, 2026'],
  ['chicago-27-date-year-comma','September 28, 2026 we','September 28, 2026, we'],
  ['chicago-28-for-example-comma','For example this','For example, this'],
  ['chicago-29-year-range','years 2020-2024','years 2020–2024'],
  ['chicago-30-slash-alternatives','on / off','on/off'],
  ['chicago-31-punctuation-space','value ,','value,'],
  ['chicago-32-website','web site','website'],
  ['chicago-33-percent-range','35-50%','35%–50%'],
  ['chicago-34-kilogram-case','5 Kg','5 kg'],
  ['chicago-35-si-plural','5 kgs','5 kg']]){
  const r=rules.find(x=>x.id===id);
  assert.equal(input.replace(new RegExp(r.pattern,r.flags),r.replacement),expected,id);
}
const website=rules.find(r=>r.id==='chicago-32-website');
assert.equal('Web site'.replace(new RegExp(website.pattern,website.flags),website.replacement),'Website');
data.set('tw-demo-rules-v4',JSON.stringify(rules.filter(r=>!/^chicago-(?:2[6-9]|3[0-5])-/.test(r.id))));
data.delete('tw-demo-rules-addition-v6');
assert.equal(context.testApi.getRules().length,16,'v6 adds rules to an existing v5 rule set');
assert.equal(context.testApi.getRules().length,16,'v6 addition runs only once');
const millis=rules.find(r=>r.id==='chicago-35-si-plural');
assert.equal('5 ms'.replace(new RegExp(millis.pattern,millis.flags),millis.replacement),'5 ms');
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
