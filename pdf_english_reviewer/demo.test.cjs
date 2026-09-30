const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('pdf_english_reviewer/demo.js', 'utf8');
const code = source.replace(/\}\)\(\);\s*$/, 'globalThis.testApi={getRules,visibleFindings,viewerState,filteredRules,ruleFilters,renderRuleRow,titleCaseText,titleCaseSuggestion,classifyTextRole,isTitleText,isProminentHeading,detectTableRows,runRulesOnPdf};})();');
assert.notEqual(code, source);
const data = new Map([['tw-demo-rules-v4', JSON.stringify([
  {id:'chicago-03-intro-clause'}, {id:'chicago-08-define-abbrev'},
  {id:'chicago-14-consistent-compound'}, {id:'custom',enabled:false}
])]]);
const elements = new Map();
const context = {console, crypto:{randomUUID:()=>String(Math.random())}, window:{}, document:{head:{appendChild(){}}, createElement(){return{}},
  addEventListener(){}, getElementById(id){return elements.get(id)||null}},
  localStorage:{getItem(k){return data.get(k)||null},setItem(k,v){data.set(k,v)},removeItem(k){data.delete(k)}}};
vm.runInNewContext(code,context);
const rules=context.testApi.getRules();
assert.equal(rules.length,80);
assert.equal(rules.filter(r=>/^chicago-2[1-5]-/.test(r.id)).length,5);
assert.equal(rules.filter(r=>/^chicago-(?:2[6-9]|3[0-5])-/.test(r.id)).length,10);
assert.equal(rules.filter(r=>/^chicago-(?:3[6-9]|4\d|5[0-5])-/.test(r.id)).length,20);
assert.equal(rules.filter(r=>/^chicago-(?:5[6-9]|6\d|7[0-5])-/.test(r.id)).length,20);
assert.equal(rules.filter(r=>/^chicago-(?:7[6-9]|8[0-7])-/.test(r.id)).length,12);
assert.equal(rules.filter(r=>/^chicago-(?:8[8-9]|9[0-6])-/.test(r.id)).length,9);
assert.ok(rules.some(r=>r.id==='space-unit'&&r.name.startsWith('Team Manual Standard')));
assert.equal(rules.filter(r=>r.id==='team-title-case').length,1);
assert.equal(rules.filter(r=>r.id==='team-table-header-case').length,1);
const titleRuleName='Team Manual Standard-Title Case for headings, figure labels, table labels, and callout';
assert.equal(rules.find(r=>r.id==='team-title-case').name,titleRuleName);
assert.ok(context.testApi.renderRuleRow(rules.find(r=>r.id==='team-title-case')).includes(titleRuleName));
assert.equal(new Set(rules.map(r=>r.id)).size,rules.length);
for(const removed of ['chicago-03-intro-clause','chicago-08-define-abbrev','chicago-14-consistent-compound']) assert.ok(!rules.some(r=>r.id===removed));
assert.ok(!rules.some(r=>/^Chicago (?:6\.26|7\.89|10\.3)\b/.test(r.name)));
assert.equal(rules.find(r=>r.id==='custom').enabled,false);
assert.equal(context.testApi.getRules().length,80);
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
for(const [id,input,expected] of [
  ['chicago-56-am-time','10 AM','10 a.m.'],
  ['chicago-57-pm-time','3 PM','3 p.m.'],
  ['chicago-58-email','e-mail','email'],
  ['chicago-59-esports','e-sports','esports'],
  ['chicago-60-eg-comma','e.g. valves','e.g., valves'],
  ['chicago-61-ie-comma','i.e. valves','i.e., valves'],
  ['chicago-62-etc-period','valves, etc','valves, etc.'],
  ['chicago-63-dc','Washington, D.C.,','Washington, DC,'],
  ['chicago-64-uk','U.K. manual','UK manual'],
  ['chicago-65-eu','E.U. manual','EU manual'],
  ['chicago-66-un','U.N. manual','UN manual'],
  ['chicago-67-month-day-cardinal','May 9th','May 9'],
  ['chicago-68-ellipsis-before','wait… and','wait … and'],
  ['chicago-69-ellipsis-after','wait …and','wait … and'],
  ['chicago-70-question-space','Really ?','Really?'],
  ['chicago-71-exclamation-space','Stop !','Stop!']]) {
  const rule=rules.find(r=>r.id===id);
  assert.equal(input.replace(new RegExp(rule.pattern,rule.flags),rule.replacement),expected,id);
}
const unit=rules.find(r=>r.id==='space-unit');
for(const [input,expected] of [['5mm','5 mm'],['2.5kPa','2.5 kPa'],['20°C','20 °C'],['50%','50%']]) {
  assert.equal(input.replace(new RegExp(unit.pattern,unit.flags),unit.replacement),expected);
}
for(const [id,input,expected] of [
  ['chicago-36-quote-comma','"ready",','"ready,"'],
  ['chicago-37-quote-period','"ready".','"ready."'],
  ['chicago-38-yes-comma','Yes we can','Yes, we can'],
  ['chicago-39-no-comma','No I cannot','No, I cannot'],
  ['chicago-40-oh-comma','Oh dear','Oh, dear'],
  ['chicago-41-ah-comma','Ah yes','Ah, yes'],
  ['chicago-42-namely-comma','Namely three','Namely, three'],
  ['chicago-43-that-is-comma','That is one','That is, one'],
  ['chicago-44-khz-case','5 KHz','5 kHz'],
  ['chicago-45-mpa-case','5 Mpa','5 MPa'],
  ['chicago-46-kpa-uppercase','5 KPA','5 kPa'],
  ['chicago-47-section-range','sections 2-4','sections 2–4'],
  ['chicago-48-chapter-range','chapters 2-4','chapters 2–4'],
  ['chicago-49-decade-apostrophe',"1990's",'1990s'],
  ['chicago-50-percent-space','5 %','5%'],
  ['chicago-51-ratio-space','3 : 1','3:1'],
  ['chicago-52-kpa-case','5 KPa','5 kPa'],
  ['chicago-53-mhz-case','5 Mhz','5 MHz'],
  ['chicago-54-ghz-case','5 Ghz','5 GHz'],
  ['chicago-55-period-space','Done .','Done.']]){
  const r=rules.find(x=>x.id===id);
  assert.equal(input.replace(new RegExp(r.pattern,r.flags),r.replacement),expected,id);
}
const noComma=rules.find(r=>r.id==='chicago-39-no-comma');
assert.equal('No problem'.replace(new RegExp(noComma.pattern,noComma.flags),noComma.replacement),'No problem');
const website=rules.find(r=>r.id==='chicago-32-website');
assert.equal('Web site'.replace(new RegExp(website.pattern,website.flags),website.replacement),'Website');
for(const [id,input,expected] of [
  ['chicago-76-from-number-range','from 2–5','from 2 to 5'],
  ['chicago-77-between-number-range','between 2-5','between 2 and 5'],
  ['chicago-78-phd-no-periods','Ph.D. candidate','PhD candidate'],
  ['chicago-85-comma-before-etc','valves etc.','valves, etc.'],
  ['chicago-91-et-al-period','Smith et al found','Smith et al. found'],
  ['chicago-92-initials-space','E.B. White','E. B. White']]) {
  const rule=rules.find(r=>r.id===id);
  assert.equal(input.replace(new RegExp(rule.pattern,rule.flags),rule.replacement),expected,id);
}
data.set('tw-demo-rules-v4',JSON.stringify(rules.filter(r=>!/^chicago-(?:2[6-9]|3[0-5])-/.test(r.id))));
data.delete('tw-demo-rules-addition-v6');
assert.equal(context.testApi.getRules().length,80,'v6 adds rules to an existing v5 rule set');
assert.equal(context.testApi.getRules().length,80,'v7 addition runs only once');
data.set('tw-demo-rules-v4',JSON.stringify(rules.filter(r=>!/^chicago-(?:3[6-9]|4\d|5[0-5])-/.test(r.id)&&r.id!=='team-title-case')));
data.delete('tw-demo-rules-expansion-v7');
assert.equal(context.testApi.getRules().length,80,'v7 adds rules while preserving existing rules');
assert.equal(context.testApi.getRules().length,80,'v7 migration is idempotent');
data.set('tw-demo-rules-v4',JSON.stringify(rules.filter(r=>!/^chicago-(?:5[6-9]|6\d|7[0-5])-/.test(r.id)).map(r=>r.id==='space-unit'?{...r,name:'Number-unit spacing'}:r)));
data.delete('tw-demo-rules-expansion-v8');
const migrated=context.testApi.getRules();
assert.equal(migrated.length,80,'v8 adds exactly 20 rules');
assert.ok(migrated.find(r=>r.id==='space-unit').name.startsWith('Team Manual Standard'));
assert.equal(context.testApi.getRules().length,80,'v8 migration is idempotent');
data.set('tw-demo-rules-v4',JSON.stringify(rules.filter(r=>r.id!=='team-table-header-case').map(r=>r.id==='team-title-case'?{...r,name:'obsolete heading rule'}:r)));
data.delete('tw-demo-rules-table-header-v9');
const tableMigrated=context.testApi.getRules();
assert.equal(tableMigrated.length,80,'table-header rule is added once to saved rules');
assert.equal(tableMigrated.find(r=>r.id==='team-title-case').name,titleRuleName);
assert.equal(context.testApi.getRules().length,80,'table-header migration is idempotent');
data.set('tw-demo-rules-v4',JSON.stringify(rules.map(r=>r.id==='team-title-case'?{...r,name:'obsolete heading rule',pattern:'legacy pattern',enabled:false}:r)));
data.set('tw-demo-rules-title-label-v11','done');
const renamedRule=context.testApi.getRules().find(r=>r.id==='team-title-case');
assert.equal(renamedRule.name,titleRuleName,'saved rule name is repaired even when older migrations are complete');
assert.equal(renamedRule.pattern,rules.find(r=>r.id==='team-title-case').pattern,'outdated display pattern is repaired');
assert.equal(renamedRule.enabled,false,'saved enabled state is preserved');
assert.equal(JSON.parse(data.get('tw-demo-rules-v4')).find(r=>r.id==='team-title-case').name,titleRuleName,'renamed rule is persisted');
assert.ok(context.testApi.renderRuleRow(renamedRule).includes(titleRuleName),'rule editor displays repaired name');
assert.equal(context.testApi.getRules().find(r=>r.id==='team-title-case').name,titleRuleName,'name repair is idempotent');
data.set('tw-demo-rules-v4',JSON.stringify(rules.filter(r=>!/^chicago-(?:7[6-9]|8[0-7])-/.test(r.id))));
data.delete('tw-demo-rules-cmos17-v9');
assert.equal(context.testApi.getRules().length,80,'first demo_v3 rule batch migrates once');
data.set('tw-demo-rules-v4',JSON.stringify(rules.filter(r=>!/^chicago-(?:8[8-9]|9[0-6])-/.test(r.id))));
data.delete('tw-demo-rules-cmos17-v10');
assert.equal(context.testApi.getRules().length,80,'second demo_v3 rule batch migrates once');
assert.equal(context.testApi.getRules().length,80,'demo_v3 rule migration is idempotent');
assert.equal(context.testApi.titleCaseText('Figure 2: the airflow and iPhone control'),'Figure 2: The Airflow and iPhone Control');
assert.equal(context.testApi.titleCaseText('the air and water system'),'The Air and Water System');
assert.equal(context.testApi.titleCaseText('the flow of air in and on the device with or inside the chamber before shutdown'),'The Flow of Air in and on the Device with or inside the Chamber before Shutdown');
assert.equal(context.testApi.titleCaseText('Results because the sample changed as time passed'),'Results because the Sample Changed as Time Passed');
assert.equal(context.testApi.titleCaseSuggestion('Figure 4: the flow of air. the pressure remains stable.'),'Figure 4: The Flow of Air. the pressure remains stable.');
const mockItem=(str,x,y,size=10,fontName='BodyRegular')=>({str,transform:[size,0,0,size,x,y],width:150,height:size,fontName});
const caption=mockItem('Figure 2: the air and water system',50,200,12);
assert.equal(context.testApi.isTitleText(caption,[caption]),true);
for(const size of [10,10.5]) {
  for(const label of ['1.2 the system and its parts','Figure 2: the air and water system','Table 1: the output and the input']) {
    const item=mockItem(label,50,200,size,'HeadingBold');
    assert.equal(context.testApi.isTitleText(item,[item]),false,`${size} pt ${label}`);
  }
  const prose=mockItem('body words end here.',50,200,size);
  assert.equal(context.testApi.classifyTextRole(prose,[prose]),'body',`${size} pt period-ending body`);
}
const scaledBodyLabel=mockItem('Figure 6: scaled body label',50,200,14,'HeadingBold');
scaledBodyLabel.height=10.5;
assert.equal(context.testApi.isTitleText(scaledBodyLabel,[scaledBodyLabel]),false,'PDF-reported 10.5 pt height is excluded');
const heading=mockItem('1.2 the results of the test',50,600,14,'HeadingBold');
const nearbyAbove=mockItem('body text ends here.',50,640,10.5);
const nearbyBelow=mockItem('more body text follows.',50,560,10.5);
assert.equal(context.testApi.classifyTextRole(heading,[nearbyAbove,heading,nearbyBelow]),'heading','bold, spaced, period-free heading');
assert.equal(context.testApi.isTitleText(heading,[heading]),false,'spacing needs a neighboring line');
assert.equal(context.testApi.isTitleText(mockItem('the results of the test',50,600,14),[nearbyAbove,nearbyBelow]),false,'regular font is not a heading');
const crowdedHeading=mockItem('the results of the test',50,628,14,'HeadingBold');
assert.equal(context.testApi.isTitleText(crowdedHeading,[nearbyAbove,crowdedHeading,nearbyBelow]),false,'bold text without spacing is not a heading');
const sentenceHeading=mockItem('the results of the test.',50,600,14,'HeadingBold');
assert.equal(context.testApi.isTitleText(sentenceHeading,[nearbyAbove,sentenceHeading,nearbyBelow]),false,'period-ending bold text is not a heading');
const splitLabel=mockItem('the split label and its details',110,190,12);
const labelPrefix=mockItem('Figure 3:',50,190,12);
assert.equal(context.testApi.isTitleText(splitLabel,[labelPrefix,splitLabel],new Set(),[labelPrefix]),true);
assert.equal(context.testApi.isTitleText(mockItem('Callout B: inlet pressure',50,200,12),[caption]),false,'callout has no label exemption');
context.testApi.ruleFilters.enabled='true';
context.testApi.ruleFilters.category='capitalization';
context.testApi.ruleFilters.name='title case';
assert.equal(context.testApi.filteredRules(rules).length,2);
context.testApi.ruleFilters.enabled='false';
assert.equal(context.testApi.filteredRules(rules).length,0);
Object.assign(context.testApi.ruleFilters,{enabled:'all',category:'all',name:''});
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
const htmlSource=fs.readFileSync('pdf_english_reviewer/index.html','utf8');
assert.ok(!htmlSource.includes('id="nav-engines"'));
assert.ok(!htmlSource.includes('id="engine-status-view"'));
assert.ok(!appSource.includes('$("nav-engines").addEventListener'));
assert.ok(appSource.includes('async function loadEngineStatus('),'review readiness checks remain available');
assert.ok(appSource.includes('max_pages: state.document.page_count'),'backend review requests all uploaded pages');
for (const id of ['sidebar-toggle','pdf-search-input','pdf-search-prev','pdf-search-next','pdf-search-count']) {
  assert.ok(htmlSource.includes(`id="${id}"`),`${id} control is present`);
}
const engineStart=appSource.indexOf('async function loadEngineStatus(');
const engineEnd=appSource.indexOf('\nfunction scheduleEngineStatusPoll(',engineStart);
const engineElements=new Map();
const engineContext={
  state:{engineProbeRunning:false,reviewRunning:false},
  api:async()=>({vale:false,preflight:{checks:[]}}),
  $:(id)=>{
    if (!engineElements.has(id)) engineElements.set(id,{classList:{toggle(){}},disabled:false});
    return engineElements.get(id);
  },
  document:{querySelector:()=>null},
  escapeHtml:(value)=>String(value),
  showToast:(message)=>{throw new Error(`Unexpected toast: ${message}`)},
};
vm.runInNewContext(appSource.slice(engineStart,engineEnd)+'\nglobalThis.loadEngineStatus=loadEngineStatus;',engineContext);
const engineStatusPromise=engineContext.loadEngineStatus(true);
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
const pdf={numPages:1,getPage:async()=>({view:[0,0,600,800],getTextContent:async()=>({items:[
  mockItem('ordinary prose remains lowercase.',50,500),
  mockItem('1.2 the system and its parts',50,450,14,'HeadingBold'),
  mockItem('the results of the test',50,400,14,'HeadingBold'),
  mockItem('the method was tested. further work continues',50,375,14,'HeadingBold'),
  mockItem('a larger body sentence should stay lowercase.',50,350,14),
  mockItem('the flow of air inside the device',50,320,10.5,'HeadingBold'),
  mockItem('nearby prose remains lowercase',80,270,8),
  mockItem('(A) air flow direction',80,250,8),caption,
  mockItem('Figure 3:',50,190,12),mockItem('the split caption and its details',110,190,12),
  mockItem('Table 1: the output and the input',50,180,12),
  mockItem('Callout B: inlet pressure',50,170,12),
  mockItem('Figure 4: the flow of air. the pressure remains stable.',50,165,12),
  mockItem('5 KHz',50,160),
  mockItem('10mm',50,150),
  mockItem('May 9th',50,140),
  mockItem('Figure 5: small label',50,120,10),
  mockItem('Table 3: compact label',50,110,10.5),
  mockItem('Callout C: small label',50,100,10),
]})})};
const opaqueFontPdf={numPages:1,getPage:async()=>({view:[0,0,600,800],getTextContent:async()=>({items:[
  mockItem('the manual for the control system',50,700,18,'g_d0_f1'),
  mockItem('operating the inlet valve',50,660,12,'g_d0_f2'),
  mockItem('The ordinary body sentence has enough words to establish size.',50,620,10,'g_d0_f3'),
  mockItem('Another ordinary body sentence contains several more words.',50,608,10,'g_d0_f3'),
  mockItem('The system follows the sequence described in this section.',50,596,10,'g_d0_f3'),
  mockItem('overview',50,550,12,'g_d0_f2'),
  mockItem('Further body text explains the features in plain language.',50,510,10,'g_d0_f3'),
  mockItem('a larger body sentence appears here.',50,490,12,'g_d0_f3'),
  mockItem('More body text continues without a heading at this point.',50,478,10,'g_d0_f3'),
]})})};
const tableTitle=mockItem('Table 2: operating parameters',50,700,12);
const tableHeaderA=mockItem('operating point',50,665,12,'HeaderBold');
const tableHeaderB=mockItem('supply voltage',280,665,12,'HeaderBold');
const tableBodyA=mockItem('nominal value',50,640,12,'BodyBold');
const tableBodyB=mockItem('measured voltage',280,640,12,'BodyBold');
const tableItems=[tableTitle,tableHeaderA,tableHeaderB,tableBodyA,tableBodyB,
  mockItem('ordinary body text without a period',50,600,10.5,'BodyBold'),
  mockItem('a separate heading',50,550,14,'HeadingBold')];
const tableRows=context.testApi.detectTableRows(tableItems,[tableTitle],10.5);
assert.ok(tableRows.headerItems.has(tableHeaderA)&&tableRows.headerItems.has(tableHeaderB));
assert.ok(tableRows.tableItems.has(tableBodyA)&&tableRows.tableItems.has(tableBodyB));
assert.equal(context.testApi.isTitleText(tableBodyA,tableItems,tableRows.tableItems),false);
const tablePdf={numPages:1,getPage:async()=>({view:[0,0,600,800],getTextContent:async()=>({items:tableItems})})};
const smallTablePdf=(size)=>({numPages:1,getPage:async()=>({view:[0,0,600,800],getTextContent:async()=>({items:[
  mockItem('Table 3: compact parameters',50,700,size),
  mockItem('measured point',50,665,size,'HeaderBold'),
  mockItem('supply current',280,665,size,'HeaderBold'),
  mockItem('test value',50,640,size,'BodyBold'),
  mockItem('read value',280,640,size,'BodyBold'),
]})})});
const reviewedPages=[];
const longPdf={numPages:301,getPage:async(pageNumber)=>{
  reviewedPages.push(pageNumber);
  return {view:[0,0,600,800],getTextContent:async()=>({items:pageNumber===301?[mockItem('5 KHz',50,100)]:[]})};
}};
Promise.all([context.testApi.runRulesOnPdf(pdf),context.testApi.runRulesOnPdf(opaqueFontPdf),context.testApi.runRulesOnPdf(tablePdf),context.testApi.runRulesOnPdf(smallTablePdf(10)),context.testApi.runRulesOnPdf(smallTablePdf(10.5)),context.testApi.runRulesOnPdf(longPdf),engineStatusPromise]).then(([findings,opaqueFindings,tableFindings,smallTable10Findings,smallTable105Findings,longFindings])=>{
  assert.ok(engineElements.get('engine-status-list').innerHTML.includes('Unavailable'));
  const titles=findings.filter(f=>f.ruleId==='team-title-case');
  assert.ok(titles.some(f=>f.suggestion==='1.2 The System and Its Parts'));
  assert.ok(titles.some(f=>f.suggestion==='The Results of the Test'));
  assert.ok(!titles.some(f=>f.text==='(A) air flow direction'));
  assert.ok(titles.some(f=>f.suggestion==='Figure 2: The Air and Water System'));
  assert.ok(titles.some(f=>f.suggestion==='The Split Caption and Its Details'));
  assert.ok(titles.some(f=>f.suggestion==='Table 1: The Output and the Input'));
  assert.ok(!titles.some(f=>f.text==='Callout B: inlet pressure'));
  assert.ok(titles.some(f=>f.suggestion==='Figure 4: The Flow of Air. the pressure remains stable.'));
  assert.ok(!titles.some(f=>f.text==='ordinary prose remains lowercase.'));
  assert.ok(!titles.some(f=>f.text==='a larger body sentence should stay lowercase.'));
  assert.ok(!titles.some(f=>f.text==='the flow of air inside the device'));
  assert.ok(!titles.some(f=>f.text==='the method was tested. further work continues'));
  assert.ok(!titles.some(f=>f.text==='nearby prose remains lowercase'));
  assert.ok(!titles.some(f=>['Figure 5: small label','Table 3: compact label','Callout C: small label'].includes(f.text)));
  assert.ok(findings.some(f=>f.ruleId==='chicago-44-khz-case'&&f.suggestion==='5 kHz'));
  assert.ok(findings.some(f=>f.ruleId==='space-unit'&&f.suggestion==='10 mm'));
  assert.ok(findings.some(f=>f.ruleId==='chicago-67-month-day-cardinal'&&f.suggestion==='May 9'));
  const opaqueTitles=opaqueFindings.filter(f=>f.ruleId==='team-title-case');
  assert.equal(opaqueTitles.length,0,'font names without a bold marker are not headings');
  assert.ok(!opaqueTitles.some(f=>f.text==='a larger body sentence appears here.'),'enlarged body prose is ignored');
  const tableTitleFindings=tableFindings.filter(f=>f.ruleId==='team-title-case');
  assert.ok(tableTitleFindings.some(f=>f.suggestion==='Table 2: Operating Parameters'));
  assert.ok(tableTitleFindings.some(f=>f.suggestion==='A Separate Heading'));
  assert.ok(!tableTitleFindings.some(f=>['operating point','supply voltage','nominal value','measured voltage'].includes(f.text)));
  const tableHeaderFindings=tableFindings.filter(f=>f.ruleId==='team-table-header-case');
  assert.deepEqual(Array.from(tableHeaderFindings,f=>f.suggestion).sort(),['Operating Point','Supply Voltage']);
  assert.ok(!tableHeaderFindings.some(f=>['nominal value','measured voltage'].includes(f.text)));
  for(const smallFindings of [smallTable10Findings,smallTable105Findings]) {
    assert.ok(!smallFindings.some(f=>['team-title-case','team-table-header-case'].includes(f.ruleId)),'10 and 10.5 pt table labels and headers are excluded');
  }
  assert.equal(reviewedPages.length,301,'every page of a long PDF is reviewed');
  assert.ok(longFindings.some(f=>f.page===301&&f.ruleId==='chicago-44-khz-case'),'last-page issue is included');
  console.log('migration, Chicago rules, headings, table headers, filters, 301-page PDF review: passed');
}).catch(error=>{console.error(error);process.exitCode=1;});
