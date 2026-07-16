const KEY='AIzaSyCSpZ-nKTCTpbg95qi6Ko11Zx0iQfHQu3k', PROJECT='quickiefix-2ea2a';
const BASE=`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
async function signIn(e,p='password'){const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e,password:p,returnSecureToken:true})});const j=await r.json();return{uid:j.localId,token:j.idToken};}
async function getDoc(t,path){const r=await fetch(`${BASE}/${path}`,{headers:{Authorization:`Bearer ${t}`}});return r.status;}
async function q(t,sq){const r=await fetch(`${BASE}:runQuery`,{method:'POST',headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json'},body:JSON.stringify({structuredQuery:sq})});const b=await r.json();return Array.isArray(b)?b.filter(x=>x.document):[];}
const eq=(f,v)=>({fieldFilter:{field:{fieldPath:f},op:'EQUAL',value:{stringValue:v}}});
const P=(n,ok,x='')=>console.log(`${ok?'PASS':'FAIL'}  ${n}${x?' — '+x:''}`);
const co=await signIn('demo-company@quickiefix.store');
const cid=(await q(co.token,{from:[{collectionId:'companies'}],where:eq('adminUserId',co.uid),limit:1}))[0].document.name.split('/').pop();
P('company admin reads own company',(await getDoc(co.token,`companies/${cid}`))===200);
const ag=await signIn('demo-property@quickiefix.store');
const s=await getDoc(ag.token,`companies/${cid}`);
P('non-member (agency admin) CANNOT read company',s===403,`HTTP ${s}`);
const all=await q(ag.token,{from:[{collectionId:'companies'}]});
P('unconstrained companies list rejected',all.length===0);
