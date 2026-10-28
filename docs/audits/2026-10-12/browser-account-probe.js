// Playwright CLI run-code body; local dev server on 127.0.0.1:5188.
// All API responses use fake fixtures. Development-only React context introspection.
await (async(page)=>{
 await page.unrouteAll({behavior:'wait'}); let who='A';
 const user=()=>({id:'audit-'+who,name:'Audit '+who,email:who+'@audit.test',role:'user',preferences:{theme:'dark',language:'en',sendOnEnter:false},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
 await page.route(url=>url.pathname.startsWith('/api/'),async route=>{const p=new URL(route.request().url()).pathname; let body={}; if(p.endsWith('/auth/logout')) who='guest'; if(p.endsWith('/auth/login')) who='B'; if(p.includes('/auth/')) body={user:user()}; else if(p.endsWith('/conversations')) body={conversations:[{id:'conversation-'+who,title:'PRIVATE ACCOUNT '+who,archived:false,pinned:false,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}]}; else if(p.endsWith('/models'))body={models:[]}; else body={files:[],messages:[],providers:[]}; await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});});
 await page.goto('http://127.0.0.1:5188/chat'); await page.waitForTimeout(1300);
 return await page.evaluate(async()=>{
  function findFiber(test){const e=document.getElementById('root');const key=Object.keys(e).find(k=>k.startsWith('__reactContainer$'));const initial=e[key];const root=initial.stateNode.current; const stack=[root];while(stack.length){const f=stack.pop();if(test(f))return f; if(f.child)stack.push(f.child);if(f.sibling)stack.push(f.sibling);}}
  const qc=findFiber(f=>f.memoizedProps?.client?.getQueryData)?.memoizedProps.client;
  const auth=()=>findFiber(f=>f.memoizedProps?.value?.logout&&f.memoizedProps?.value?.login)?.memoizedProps.value;
  if(!qc||!auth())throw Error('Cannot locate test fixture contexts');
  const drafts=await import('/src/stores/draftStore.ts'); drafts.useDraftStore.getState().setDraft('new','PRIVATE DRAFT A');
  const before=qc.getQueryData(['conversations']); await auth().logout(); await new Promise(r=>setTimeout(r,70));await auth().login('B@audit.test','fake-offline-password');await new Promise(r=>setTimeout(r,120));
  return {account:auth().user.id,before,after:qc.getQueryData(['conversations']),draft:drafts.useDraftStore.getState().drafts.new};
 });
})(page);
