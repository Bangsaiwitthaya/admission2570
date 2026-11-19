'use strict';
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const state = {settings:{},schools:[],addressTree:{},addressesReady:false,level:'ม.1',editingNid:null};
const calendarNames = [
  ['calendar_online','กรอกข้อมูลผ่านระบบ'],
  ['calendar_submit','วันรับสมัคร (ยื่นเอกสารที่โรงเรียน)'],
  ['calendar_eligible','ประกาศรายชื่อผู้มีสิทธิ์สอบ'],
  ['calendar_exam','สอบวัดความรู้'],
  ['calendar_placement','ประกาศผลการจัดห้องเรียน'],
  ['calendar_enrollment','รายงานตัวและมอบตัว']
];
function escapeHTML(x) {return String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function message(id,txt,type='') {const el=$(id);if(!el)return;el.textContent=txt;el.className='message '+type;}
async function api(action,data={}) {
  const url=window.ADMISSION_API_URL||'';
  if(!url.startsWith('https://')||url.includes('YOUR-WORKER'))throw Error('ยังไม่ตั้งค่า URL ของ Cloudflare Worker ใน config.js');
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),35000);
  try {
    const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,data}),signal:controller.signal,cache:'no-store'});
    const json=await res.json();
    if (!json.ok) throw Error(json.error||'ไม่สามารถดำเนินการได้');
    return json.data;
  } catch(err) {
    if(err.name==='AbortError') throw Error('ระบบตอบกลับช้า กรุณาตรวจสอบข้อมูลก่อนกดบันทึกซ้ำ');
    throw err;
  } finally {clearTimeout(timer);}
}
function go(section, level){
  $$('.view').forEach(el=>el.classList.toggle('active',el.id===section));
  if(section==='apply')setLevel(level||state.level);
  window.scrollTo({top:0,behavior:'smooth'});
}
$$('[data-go]').forEach(btn=>btn.addEventListener('click',e=>{e.preventDefault();go(btn.dataset.go,btn.dataset.level);}));
function calendarRender(){
  $('#calendar').innerHTML=calendarNames.map(([key,label],i)=>`<div class="calendar-item"><span class="calendar-num">${i+1}</span><div><strong>${escapeHTML(label)}</strong><p>${escapeHTML(state.settings[key]||'รอประกาศกำหนดการ')}</p></div></div>`).join('');
  $('#publicNotice').textContent=state.settings.announcement||'ติดตามประกาศการรับสมัครนักเรียน ปีการศึกษา 2570 จากโรงเรียนบางไทรวิทยา';
}
function fillSelect(el,values,placeholder='— กรุณาเลือก —',chosen=''){
  const opts=[{value:'',label:placeholder},...values.map(x=>typeof x==='string'?{value:x,label:x}:x)];
  el.replaceChildren(...opts.map(opt=>{const o=document.createElement('option');o.value=opt.value;o.textContent=opt.label;return o;}));
  el.value=chosen||'';
}
function schoolRender(){
  const previous=$('#school_select').value;
  fillSelect($('#school_select'),[...state.schools,{value:'__other__',label:'★ โรงเรียนอื่น (นอกเขตบริการ)'}],'— เลือกโรงเรียนเดิม —',previous);
}
function setLevel(level){
  if(!['ม.1','ม.4'].includes(level))level='ม.1';
  state.level=level;
  $('#student_level').value=level;
  $('#levelPill').textContent=level;
  $('#levelPill').classList.toggle('m4',level==='ม.4');
  $('#applyTitle').textContent='ใบสมัครเข้าศึกษาต่อ ระดับชั้น '+level;
  $('#m1school').hidden=level!=='ม.1';
  $('#m4school').hidden=level!=='ม.4';
  $('#study_plan').required=level==='ม.4';
  $('#m4origin').required=level==='ม.4';
  $('#school_select').required=level==='ม.1';
  $('#previous_school_name').readOnly=(level==='ม.1'&&$('#school_select').value!=='__other__')||(level==='ม.4'&&$('#m4origin').value==='โรงเรียนบางไทรวิทยา');
}
$('#school_select').addEventListener('change',()=>{
  const v=$('#school_select').value;
  $('#previous_school_name').value=v&&v!=='__other__'?v:'';
  $('#previous_school_name').readOnly=!!v&&v!=='__other__';
  $('#previous_school_name').placeholder=v==='__other__'?'พิมพ์ชื่อโรงเรียนอื่น':'ชื่อโรงเรียนที่เลือก';
});
$('#m4origin').addEventListener('change',()=>{
  const own=$('#m4origin').value==='โรงเรียนบางไทรวิทยา';
  $('#previous_school_name').value=own?'โรงเรียนบางไทรวิทยา':'';
  $('#previous_school_name').readOnly=own;
});
function provinces(){return Object.keys(state.addressTree||{}).sort((a,b)=>a.localeCompare(b,'th'));}
function addressDropdowns(){
  const province=$('#address_province'),district=$('#address_district'),subdistrict=$('#address_subdistrict');
  const schoolProvince=$('#previous_school_province'),schoolDistrict=$('#previous_school_district');
  function refreshDistrict(){fillSelect(district,Object.keys(state.addressTree[province.value]||{}).sort((a,b)=>a.localeCompare(b,'th')),'เลือกอำเภอ');refreshSubdistrict();}
  function refreshSubdistrict(){fillSelect(subdistrict,(state.addressTree[province.value]?.[district.value]||[]).map(x=>({value:x.s,label:x.s})),'เลือกตำบล');$('#address_zipcode').value='';}
  function refreshSchoolDistrict(){fillSelect(schoolDistrict,Object.keys(state.addressTree[schoolProvince.value]||{}).sort((a,b)=>a.localeCompare(b,'th')),'เลือกอำเภอ');}
  province.onchange=refreshDistrict;district.onchange=refreshSubdistrict;
  subdistrict.onchange=()=>{$('#address_zipcode').value=(state.addressTree[province.value]?.[district.value]||[]).find(x=>x.s===subdistrict.value)?.z||'';};
  schoolProvince.onchange=refreshSchoolDistrict;
  fillSelect(province,provinces(),'เลือกจังหวัด');fillSelect(schoolProvince,provinces(),'เลือกจังหวัด');
  refreshDistrict();refreshSchoolDistrict();
}
function setAddressFromData(data){
  const pr=$('#address_province'),di=$('#address_district'),su=$('#address_subdistrict');
  pr.value=data.address_province||'';pr.dispatchEvent(new Event('change'));
  di.value=data.address_district||'';di.dispatchEvent(new Event('change'));
  su.value=data.address_subdistrict||'';su.dispatchEvent(new Event('change'));
  if(data.address_zipcode)$('#address_zipcode').value=data.address_zipcode;
  const sp=$('#previous_school_province'),sd=$('#previous_school_district');
  sp.value=data.previous_school_province||'';sp.dispatchEvent(new Event('change'));
  sd.value=data.previous_school_district||'';
}
function setFormData(data){
  const form=$('#applicationForm');
  for(const [key,value] of Object.entries(data)) {
    const field=form.elements.namedItem(key);
    if(field&&'value' in field) field.value=String(value??'');
  }
  if(data.student_level==='ม.1'){
    const school=String(data.previous_school_name||'');
    $('#school_select').value=state.schools.includes(school)?school:'__other__';
    $('#school_select').dispatchEvent(new Event('change'));
    $('#previous_school_name').value=school;
  } else {
    const own=data.school_origin_status==='โรงเรียนบางไทรวิทยา'||data.previous_school_name==='โรงเรียนบางไทรวิทยา';
    $('#m4origin').value=own?'โรงเรียนบางไทรวิทยา':'โรงเรียนอื่น';
    $('#previous_school_name').readOnly=own;
    $('#previous_school_name').value=data.previous_school_name||'';
  }
  setAddressFromData(data);
}
function resetForm(){
  state.editingNid=null;$('#applicationForm').reset();$('#school_select').value='';
  $('#previous_school_name').readOnly=false;message('#formMessage','');
  $('#saveBtn').textContent='บันทึกใบสมัคร';
}
$$('[data-go="apply"]').forEach(btn=>btn.addEventListener('click',()=>resetForm(),{capture:true}));
$('#applicationForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const form=e.currentTarget;
  const data=Object.fromEntries(new FormData(form));
  data.previous_school_name=$('#previous_school_name').value.trim();
  if(!/^[0-9]{13}$/.test(data.national_id||'')){message('#formMessage','เลขบัตรประชาชนต้องมี 13 หลัก','error');return;}
  if(!data.previous_school_name){message('#formMessage','กรุณาระบุโรงเรียนเดิม','error');return;}
  if(state.level==='ม.1')data.service_area_status=state.schools.some(s=>s.replace(/^โรงเรียน/,'').trim()===data.previous_school_name.replace(/^โรงเรียน/,'').trim())?'ในเขตบริการ':'นอกเขตบริการ';
  if(state.level==='ม.4')data.school_origin_status=$('#m4origin').value;
  const btn=$('#saveBtn');btn.disabled=true;message('#formMessage','กำลังบันทึกข้อมูล...','busy');
  try {
    const response=state.editingNid?await api('update',{national_id:state.editingNid,fields:data}):await api('apply',data);
    message('#formMessage',(response?.message||'บันทึกข้อมูลสำเร็จ')+'\nโปรดนำเอกสารมายื่นที่โรงเรียนตามกำหนดการ','ok');
    if(!state.editingNid)form.reset();
    state.editingNid=null;btn.textContent='บันทึกใบสมัคร';
    window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'});
  }catch(err){message('#formMessage',err.message,'error');}
  finally{btn.disabled=false;}
});
$('#lookupForm').addEventListener('submit',async e=>{
  e.preventDefault();message('#lookupMessage','กำลังค้นหาข้อมูล...','busy');$('#lookupResult').innerHTML='';
  try{
    const data=await api('lookup',{national_id:$('#lookupNid').value.trim()});
    if(!data){message('#lookupMessage','ไม่พบข้อมูลผู้สมัคร','error');return;}
    message('#lookupMessage','พบข้อมูลการสมัคร','ok');
    const lines=[['ชื่อ–สกุล',(data.prefix||'')+(data.first_name||'')+' '+(data.last_name||'')],['ระดับชั้น',data.student_level],['โรงเรียนเดิม',data.previous_school_name],['เลขที่ใบสมัคร',data.application_id||'ยังไม่ได้ยืนยัน'],['สถานะ',data.is_confirmed||'รอยืนยัน'],['วันสอบ',data.exam_date||'รอประกาศ'],['ห้องสอบ',data.exam_room||'รอยืนยัน'],['เลขที่นั่ง',data.exam_seat||'รอยืนยัน']];
    const div=document.createElement('div');div.className='resultcard';
    div.innerHTML='<h3>ข้อมูลผู้สมัคร</h3><dl>'+lines.map(([a,b])=>`<dt>${escapeHTML(a)}</dt><dd>${escapeHTML(b||'-')}</dd>`).join('')+'</dl>';
    if(data.is_confirmed!=='ยืนยันแล้ว'){
      const button=document.createElement('button');button.type='button';button.className='btn btn-primary';button.textContent='แก้ไขข้อมูลผู้สมัคร';
      button.addEventListener('click',async()=>{
        if(!state.addressesReady)await loadAddresses();
        resetForm();setLevel(data.student_level);setFormData(data);state.editingNid=data.national_id;
        $('#saveBtn').textContent='บันทึกการแก้ไข';go('apply',data.student_level);
        $('#applicationForm').elements.namedItem('national_id').readOnly=true;
      });
      div.appendChild(button);
    }
    $('#lookupResult').replaceChildren(div);
  }catch(err){message('#lookupMessage',err.message,'error');}
});
$('#resultsForm').addEventListener('submit',async e=>{
  e.preventDefault();message('#resultsOutput','กำลังตรวจสอบผลสอบ...','busy');
  try {
    const r=await api('results',{national_id:$('#resultsNid').value.trim()});
    if(r.status!=='success'){message('#resultsOutput',r.message||'ยังไม่มีผลสอบ','error');return;}
    const items=Object.entries(r.scores||{}).filter(([key])=>key!=='application_id');
    const safeName=escapeHTML(r.studentInfo?.name||'');
    $('#resultsOutput').className='resultcard';
    $('#resultsOutput').innerHTML=`<h3>ผลสอบ: ${safeName}</h3><p>${escapeHTML(r.studentInfo?.level||'')} · ${escapeHTML(r.studentInfo?.appId||'')}</p>`+items.map(([key,value])=>`<div class="score-row"><strong>${escapeHTML(key)}</strong><span>${escapeHTML(value)}</span></div>`).join('');
  }catch(err){message('#resultsOutput',err.message,'error');}
});
async function loadAddresses(){
  try {state.addressTree=await api('addresses');state.addressesReady=true;addressDropdowns();}
  catch(err){state.addressesReady=false;console.warn('AddressDB:',err.message);}
}
async function boot(){
  fillSelect($('#dob_day'),Array.from({length:31},(_,i)=>String(i+1)),'เลือกวัน');
  fillSelect($('#dob_month'),['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'],'เลือกเดือน');
  calendarRender();
  try {const data=await api('bootstrap');state.settings=data.settings||{};state.schools=data.schools||[];schoolRender();calendarRender();}
  catch(err){$('#publicNotice').textContent='ไม่สามารถโหลดประกาศได้: '+err.message;schoolRender();}
  await loadAddresses();
}
boot();
