import {
  Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef, Output, EventEmitter
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  SignalService, AnimationService,
  ChannelView, SingleView,
  PolarView, PolarRatioView, ScatterView, DigitalXorView,
  channelColorOverrides, channelThickOverrides, onChannelColorChange,
  CHANNEL_COLORS, setChannelColor
} from './canvas-views';

const API_BASE = 'http://127.0.0.1:8000/api';

@Component({
  selector: 'app-signal-viewer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './signal-viewer.component.html',
})
export class SignalViewerComponent implements OnInit, OnDestroy {
  @Output() statusChange = new EventEmitter<{ live: boolean; text: string }>();

  // ECG ViewChild refs
  @ViewChild('channelsContainer')    channelsContainerRef!:    ElementRef<HTMLElement>;
  @ViewChild('channelCustomBody')    channelCustomBodyRef!:    ElementRef<HTMLElement>;
  @ViewChild('recurrenceCanvas')     recurrenceCanvasRef!:     ElementRef<HTMLCanvasElement>;
  @ViewChild('polarCanvas')          polarCanvasRef!:          ElementRef<HTMLCanvasElement>;
  @ViewChild('polar2Canvas')         polar2CanvasRef!:         ElementRef<HTMLCanvasElement>;
  @ViewChild('digitalXorCanvas')     digitalXorCanvasRef!:     ElementRef<HTMLCanvasElement>;

  // EEG ViewChild refs
  @ViewChild('eegChannelsContainer') eegChannelsContainerRef!: ElementRef<HTMLElement>;
  @ViewChild('eegChannelCustomBody') eegChannelCustomBodyRef!: ElementRef<HTMLElement>;
  @ViewChild('eegRecurrenceCanvas')  eegRecurrenceCanvasRef!:  ElementRef<HTMLCanvasElement>;
  @ViewChild('eegPolarCanvas')       eegPolarCanvasRef!:       ElementRef<HTMLCanvasElement>;
  @ViewChild('eegPolar2Canvas')      eegPolar2CanvasRef!:      ElementRef<HTMLCanvasElement>;
  @ViewChild('eegDigitalXorCanvas')  eegDigitalXorCanvasRef!:  ElementRef<HTMLCanvasElement>;

  // ── Tab state ──
  activeSignalTab: 'ecg' | 'eeg' = 'ecg';

  // ── ECG services ──
  ss = new SignalService();
  as = new AnimationService();

  // ── EEG services ──
  eegSS = new SignalService();
  eegAS = new AnimationService();

  // ── ECG state ──
  status = 'STANDBY'; statusActive = false; channelCount = '0 LEADS';
  errorMsg = ''; showError = false; showMetaBar = false; showAiPanel = false;
  showPlotModeChoice = false; showChannelCustomSection = false; showGlobalConfigBar = false;
  showPeriodSection = false; showRecurrenceSection = false; showPolarSection = false;
  showPolar2Section = false; showXorSection = false; isDragOver = false; isUploading = false;
  mRecord='—'; mFs='—'; mLeads='—'; mDuration='—'; mSamples='—'; mSigNames='—';
  aiPanelClass='sv-ai-panel'; aiIcon='🫀'; aiPrimaryLabel='—'; aiPrimaryLabelColor='';
  aiPrimarySub='AWAITING ANALYSIS'; aiHR='—'; aiLeads='—'; aiConfPct='—';
  aiConfPctColor=''; aiRingStroke=''; aiRingDashArray='169.6'; aiRingDashOffset='169.6';
  aiDescription='—'; aiDescriptionBorderColor=''; aiDescriptionBg='';
  aiActionText='—'; showAiAction=false; aiFindings: any[]=[];
  showAiFindings=false; aiMethodTag='⬡ METHOD: —'; aiLeadsNote='';
  periodValue=1000; periodSliderMin=10; periodSliderMax=10000;
  windowInput=1000; speedSlider=1; speedInput=1;
  rCh1Options: any[]=[];rCh2Options: any[]=[]; pChOptions: any[]=[];
  p2Ch1Options: any[]=[]; p2Ch2Options: any[]=[]; xorChOptions: any[]=[];
  rCh1=0; rCh2=1; pCh=0; p2Ch1=0; p2Ch2=1; xorCh=0;
  showBtnSnapR=false; showBtnResetR=false; showScatterZoomBadge=false;
  showBtnSnapP=false; showBtnResetP=false; showPolarZoomBadge=false;
  showBtnSnapP2=false; showBtnResetP2=false; showPolar2ZoomBadge=false;
  showXorChunkBadge=false; showBtnSnapDXor=false; showXorStats=false; gAmpBadge='AMP ×1.00';
  chViews: ChannelView[]=[]; singleView: SingleView|null=null;
  private _scatterView: ScatterView|null=null; private _polarView: PolarView|null=null;
  private _polar2View: PolarRatioView|null=null; private _digitalXorView: DigitalXorView|null=null;
  private _lastR: any=null; private _lastP: any=null; private _lastP2: any=null; private _lastXor: any=null;
  private gScaleY=1;
  xorThresh=8; xorThreshVal='8%';

  // ── EEG state ──
  eegIsDragOver=false; eegIsUploading=false; eegShowError=false; eegErrorMsg='';
  eegShowMetaBar=false; eegShowAI=false; eegAIResult: any=null;
  eegShowPlotModeChoice=false; eegShowChannelCustomSection=false; eegShowGlobalConfigBar=false;
  eegShowPeriodSection=false; eegShowRecurrenceSection=false; eegShowPolarSection=false;
  eegShowPolar2Section=false; eegShowXorSection=false;
  eegMRecord='—'; eegMFs='—'; eegMCh='—'; eegMDur='—'; eegMSamples='—'; eegMNames='—';
  eegPeriodValue=1000; eegWindowInput=1000; eegSpeedSlider=1; eegSpeedInput=1;
  eegGAmpBadge='AMP ×1.00'; eegXorThreshVal='8%';
  eegChViews: ChannelView[]=[]; eegSingleView: SingleView|null=null;
  private eegScatterView: ScatterView|null=null; private eegPolarView: PolarView|null=null;
  private eegPolar2View: PolarRatioView|null=null; private eegDigitalXorView: DigitalXorView|null=null;
  private eegLastR: any=null; private eegLastP: any=null; private eegLastP2: any=null; private eegLastXor: any=null;
  private eegGScaleY=1;
  private _ecgColorSave: any={}; private _ecgThickSave: any={};
  private eegChColorOverrides: any={}; private eegChThickOverrides: number[]=[];

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.ss.on('status', (v:string)=>{ this.status=v; this.statusChange.emit({live:this.statusActive,text:v}); this.cdr.detectChanges(); });
    this.ss.on('statusActive', (v:boolean)=>{ this.statusActive=v; this.statusChange.emit({live:v,text:this.status}); this.cdr.detectChanges(); });
    this.ss.on('numChannels', (v:number)=>{ this.channelCount=`${v} LEADS`; this.cdr.detectChanges(); });
    this.as.start(); this.eegAS.start();
  }

  ngOnDestroy() {
    this.chViews.forEach(c=>c.destroy()); if(this.singleView) this.singleView.destroy();
    this.eegChViews.forEach(c=>c.destroy()); if(this.eegSingleView) this.eegSingleView.destroy();
  }

  // ── Tab switching ──
  switchSignalTab(tab: 'ecg'|'eeg') {
    this.activeSignalTab = tab;
    this.cdr.detectChanges();
  }

  // ── ECG Upload ──
  onDragOver(e: DragEvent){e.preventDefault();this.isDragOver=true;}
  onDragLeave(){this.isDragOver=false;}
  onDrop(e: DragEvent){e.preventDefault();this.isDragOver=false;this._handleFiles(e.dataTransfer?.files??null);}
  onFileChange(e: Event){this._handleFiles((e.target as HTMLInputElement).files);}
  onUploadClick(fi: HTMLInputElement){fi.click();}

  _handleFiles(files: FileList|null){
    if(!files?.length) return;
    const arr=Array.from(files);
    const hea=arr.find(f=>f.name.toLowerCase().endsWith('.hea'));
    const csv=arr.find(f=>f.name.toLowerCase().endsWith('.csv'));
    this._showError('');
    if(hea) this._uploadWFDB(arr);
    else if(csv) this._readCSV(csv);
    else this._showError('No .hea file found. Select ALL record files (.hea + .dat + companions), or use .csv.');
  }

  _uploadWFDB(files: File[]){
    this._resetView(); this.isUploading=true;
    this.ss.set('status',`UPLOADING… (${files.length} files)`); this.ss.set('statusActive',false);
    const xhr=new XMLHttpRequest(); xhr.open('POST',`${API_BASE}/upload-view/`);
    xhr.upload.onprogress=e=>{if(e.lengthComputable)this.ss.set('status',`UPLOADING… ${Math.round(e.loaded/e.total*100)}%`);};
    xhr.onload=()=>{this.isUploading=false;if(xhr.status>=200&&xhr.status<300){try{this._loadFromData(JSON.parse(xhr.responseText));}catch(e){this._showError('Server returned invalid JSON.');}}else{let m=`HTTP ${xhr.status}`;try{m=JSON.parse(xhr.responseText).error||m;}catch(_){}this._showError(`Upload failed: ${m}`);}this.cdr.detectChanges();};
    xhr.onerror=()=>{this.isUploading=false;this._showError('Cannot reach Django server at port 8000.');this.cdr.detectChanges();};
    const fd=new FormData(); files.forEach(f=>fd.append('files',f,f.name)); xhr.send(fd);
  }

  _readCSV(file: File){
    this._resetView(); this.ss.set('status','READING CSV…'); this.ss.set('statusActive',false);
    const reader=new FileReader();
    reader.onload=e=>{
      const rows=(e.target!.result as string).split(/\r?\n/).filter(r=>r.trim());
      if(!rows.length){this._showError('Empty CSV.');return;}
      let start=0; if(rows[0].split(',').some(v=>isNaN(parseFloat(v.trim()))))start=1;
      const n=rows[start].split(',').map(v=>parseFloat(v.trim())).filter(v=>!isNaN(v)).length;
      const ch: number[][]=Array(n).fill(null).map(()=>[]);
      for(let r=start;r<rows.length;r++){rows[r].split(',').map(v=>parseFloat(v.trim())).forEach((v,i)=>{if(i<n&&!isNaN(v))ch[i].push(v);});}
      this._loadFromData({record_name:file.name.replace('.csv',''),fs:360,num_leads:n,total_samples:ch[0].length,sig_names:ch.map((_,i)=>`CH${i+1}`),sig_units:Array(n).fill('mV'),duration_sec:(ch[0].length/360).toFixed(2),channels:ch,num_channels:n,num_samples:ch[0].length});
      this.cdr.detectChanges();
    };
    reader.readAsText(file);
  }

  _loadFromData(data: any){
    const ch=data.channels||[data.signal]; const init=Math.min(1000,ch[0].length);
    this.ss.set('signalData',ch); this.ss.set('numChannels',ch.length);
    this.ss.set('numSamples',ch[0].length); this.ss.set('recordName',data.record_name||'');
    this.ss.set('fs',data.fs||360);
    this.ss.set('sigNames',data.sig_names||ch.map((_:any,i:number)=>`Lead ${i+1}`));
    this.ss.set('duration',data.duration_sec||0); this.ss.set('windowWidth',init);
    this.ss.set('status',`${ch.length} LEADS · ${ch[0].length} SMPL`); this.ss.set('statusActive',true);
    this.mRecord=data.record_name||'N/A'; this.mFs=`${data.fs||'?'} Hz`;
    this.mLeads=String(ch.length); this.mDuration=`${data.duration_sec||'?'} s`;
    this.mSamples=(data.total_samples||ch[0].length).toLocaleString();
    this.mSigNames=(data.sig_names||[]).join(', ')||'—';
    this.showMetaBar=true; this.periodSliderMax=Math.max(100,ch[0].length);
    this.periodValue=init; this.windowInput=init; this.showPlotModeChoice=true;
    if(data.ai) this._renderAI(data.ai); this.cdr.detectChanges();
  }

  _renderAI(ai: any){
    if(!ai) return;
    const p=ai.primary||{},sev=p.severity||'info',color=p.color||'#63b3ed',conf=p.confidence||0;
    const icons: Record<string,string>={normal:'💚',info:'💙',warning:'⚠️',critical:'🚨'};
    this.aiPanelClass=`sv-ai-panel show severity-${sev}`; this.showAiPanel=true;
    this.aiIcon=icons[sev]||'🫀'; this.aiPrimaryLabel=p.label||'—'; this.aiPrimaryLabelColor=color;
    this.aiPrimarySub=`${p.code||'—'} · ${ai.is_normal===true?'NORMAL':ai.is_normal===false?'ABNORMAL':'UNKNOWN'}`;
    this.aiHR=ai.hr_bpm?`${ai.hr_bpm}`:'—'; this.aiLeads=ai.num_leads_used||'—';
    const circ=2*Math.PI*27,off=circ*(1-conf);
    this.aiRingStroke=color; this.aiRingDashArray=String(circ);
    setTimeout(()=>{this.aiRingDashOffset=String(off);this.cdr.detectChanges();},50);
    this.aiConfPct=`${Math.round(conf*100)}%`; this.aiConfPctColor=color;
    this.aiDescription=p.description||'—'; this.aiDescriptionBorderColor=color; this.aiDescriptionBg=color+'10';
    this.aiActionText=p.action||'—'; this.showAiAction=sev!=='normal';
    const findings=ai.findings||[];
    if(findings.length>1){this.showAiFindings=true;this.aiFindings=findings.map((f:any)=>({color:f.color,label:f.label,confidence:f.confidence,barWidth:'0%'}));setTimeout(()=>{this.aiFindings.forEach(f=>f.barWidth=`${Math.round(f.confidence*100)}%`);this.cdr.detectChanges();},100);}
    else{this.showAiFindings=false;}
    const ml: Record<string,string>={neural:'⬡ NEURAL NET · ResNet-1D',random_forest:'⬡ RANDOM FOREST · MIT-BIH',heuristic:'⬡ RULE-BASED · Heuristic',error:'⬡ UNAVAILABLE'};
    this.aiMethodTag=ml[ai.method]||`⬡ ${ai.method}`;
    this.aiLeadsNote=(ai.leads_note||'')+(ai.num_beats?` · ${ai.num_beats} beats analyzed`:'');
    this.cdr.detectChanges();
  }

  activateSeparate(){
    this.showPlotModeChoice=false; this.showChannelCustomSection=false; this.showGlobalConfigBar=true;
    this.gScaleY=1; this.gAmpBadge='AMP ×1.00';
    const c=this.channelsContainerRef.nativeElement; c.innerHTML='';
    this.chViews.forEach(v=>v.destroy()); this.chViews=[];
    const n=this.ss.get('numChannels');
    for(let i=0;i<n;i++) this.chViews.push(new ChannelView(c,i,this.ss,this.as));
    this._setupAnalysis(); this.ss.set('status','LIVE · SEPARATE'); this.cdr.detectChanges();
  }

  activateSingle(){
    this.showPlotModeChoice=false; this.showChannelCustomSection=true; this.showGlobalConfigBar=false;
    const c=this.channelsContainerRef.nativeElement; c.innerHTML='';
    if(this.singleView){this.singleView.destroy();this.singleView=null;}
    this.singleView=new SingleView(c,this.ss,this.as);
    this._setupAnalysis(); this.ss.set('status','LIVE · OVERLAY'); this.cdr.detectChanges();
    setTimeout(()=>{this._buildCustomSection();this.cdr.detectChanges();});
  }

  gBtnPlay(){const s=this.ss.get('playbackSpeed')||1;this.chViews.forEach(cv=>{if(cv.paused){cv.windowStart=cv.frozenStart-this.as.t*s;cv.paused=false;}});}
  gBtnPause(){this.chViews.forEach(cv=>{cv.frozenStart=cv._leftEdge(this.as.t);cv.paused=true;});}
  gBtnAmpIn(){this.gScaleY=Math.min(20,this.gScaleY*1.5);this.chViews.forEach(cv=>{cv.scaleY=this.gScaleY;cv._updateBadge?.();});this.gAmpBadge=`AMP ×${this.gScaleY.toFixed(2)}`;}
  gBtnAmpOut(){this.gScaleY=Math.max(0.05,this.gScaleY/1.5);this.chViews.forEach(cv=>{cv.scaleY=this.gScaleY;cv._updateBadge?.();});this.gAmpBadge=`AMP ×${this.gScaleY.toFixed(2)}`;}
  gBtnReset(){this.gScaleY=1;this.chViews.forEach(cv=>{cv.scaleY=1;cv.windowStart=0;cv._updateBadge?.();});this.gAmpBadge='AMP ×1.00';}

  onPeriodSliderChange(e: Event){const v=parseInt((e.target as HTMLInputElement).value);this.periodValue=v;this.windowInput=v;this._applyWindowChange(v);}
  onWindowInputChange(e: Event){const v=parseInt((e.target as HTMLInputElement).value);if(!isNaN(v)&&v>0)this._applyWindowChange(v);}
  onWindowInputBlur(e: Event){const v=parseInt((e.target as HTMLInputElement).value);this._applyWindowChange(isNaN(v)?this.ss.get('windowWidth'):v);}
  onWindowInputKeydown(e: KeyboardEvent){if(e.key==='Enter')(e.target as HTMLElement).blur();}
  _applyWindowChange(v: number){v=Math.max(10,Math.min(this.periodSliderMax,Math.round(v)));if(isNaN(v))return;this.periodValue=v;this.windowInput=v;this.chViews.forEach(cv=>cv.anchorAndResize?.());if(this.singleView)this.singleView.anchorAndResize?.();this.ss.set('windowWidth',v);this._refreshAnalysis();this.cdr.detectChanges();}

  onSpeedSliderChange(e: Event){this._applySpeedChange(parseFloat((e.target as HTMLInputElement).value));}
  onSpeedInputChange(e: Event){const v=parseFloat((e.target as HTMLInputElement).value);if(!isNaN(v))this._applySpeedChange(v);}
  onSpeedInputBlur(e: Event){const v=parseFloat((e.target as HTMLInputElement).value);this._applySpeedChange(isNaN(v)?1:v);}
  onSpeedInputKeydown(e: KeyboardEvent){if(e.key==='Enter')(e.target as HTMLElement).blur();}
  _applySpeedChange(v: number){v=Math.max(-20,Math.min(20,Math.round(v*10)/10));this.chViews.forEach(cv=>cv.applySpeed?.(v));if(this.singleView)this.singleView.applySpeed?.(v);this.ss.set('playbackSpeed',v);this.speedSlider=v;this.speedInput=v;this.cdr.detectChanges();}

  onXorThreshChange(e: Event){this.xorThreshVal=(e.target as HTMLInputElement).value+'%';}

  _setupAnalysis(){
    const n=this.ss.get('numChannels'),names=this.ss.get('sigNames');
    const mk=()=>Array.from({length:n},(_,i)=>({value:i,label:names[i]||`Lead ${i+1}`}));
    this.rCh1Options=mk();this.rCh2Options=mk();this.pChOptions=mk();this.p2Ch1Options=mk();this.p2Ch2Options=mk();this.xorChOptions=mk();
    this.rCh1=0;this.rCh2=n>=2?1:0;this.p2Ch1=0;this.p2Ch2=n>=2?1:0;
    this.showPeriodSection=true;this.showRecurrenceSection=true;this.showPolarSection=true;this.showPolar2Section=true;this.showXorSection=true;this.cdr.detectChanges();
  }

  renderRecurrence(){const sd=this.ss.get('signalData'),ci=this.rCh1,cj=this.rCh2;if(!sd[ci]||!sd[cj])return;if(this._scatterView){this._scatterView.destroy();this._scatterView=null;}this.showBtnSnapR=true;this.showBtnResetR=true;this.showScatterZoomBadge=true;this.cdr.detectChanges();setTimeout(()=>{const canvas=this.recurrenceCanvasRef?.nativeElement;const s=document.getElementById('btnSnapR'),r=document.getElementById('btnResetR'),b=document.getElementById('scatterZoomBadge');if(canvas)this._scatterView=new ScatterView(canvas,sd[ci],sd[cj],ci,cj,this.as,s,r,b);this._lastR={ci,cj};});}
  renderPolar(){const sd=this.ss.get('signalData'),ci=this.pCh;if(!sd[ci]?.length)return;if(this._polarView){this._polarView.destroy();this._polarView=null;}this.showBtnSnapP=true;this.showBtnResetP=true;this.showPolarZoomBadge=true;this.cdr.detectChanges();setTimeout(()=>{const canvas=this.polarCanvasRef?.nativeElement;const s=document.getElementById('btnSnapP'),r=document.getElementById('btnResetP'),b=document.getElementById('polarZoomBadge');if(canvas)this._polarView=new PolarView(canvas,sd[ci],ci,this.ss.get('windowWidth'),this.as,s,r,b);this._lastP={ci};});}
  renderPolar2(){const sd=this.ss.get('signalData'),ci=this.p2Ch1,cj=this.p2Ch2;if(!sd[ci]||!sd[cj])return;if(this._polar2View){this._polar2View.destroy();this._polar2View=null;}this.showBtnSnapP2=true;this.showBtnResetP2=true;this.showPolar2ZoomBadge=true;this.cdr.detectChanges();setTimeout(()=>{const canvas=this.polar2CanvasRef?.nativeElement;const s=document.getElementById('btnSnapP2'),r=document.getElementById('btnResetP2'),b=document.getElementById('polar2ZoomBadge');if(canvas)this._polar2View=new PolarRatioView(canvas,sd[ci],sd[cj],ci,cj,this.ss.get('windowWidth'),this.as,s,r,b);this._lastP2={ci,cj};});}
  renderXor(){const sd=this.ss.get('signalData'),ci=this.xorCh;if(!sd[ci]?.length)return;if(this._digitalXorView){this._digitalXorView.destroy();this._digitalXorView=null;}this.showXorChunkBadge=true;this.showBtnSnapDXor=true;this.showXorStats=false;this.cdr.detectChanges();setTimeout(()=>{const canvas=this.digitalXorCanvasRef?.nativeElement;const badge=document.getElementById('xorChunkBadge'),stats=document.getElementById('xorStats'),snap=document.getElementById('btnSnapDXor');if(canvas)this._digitalXorView=new DigitalXorView(canvas,sd[ci],ci,this.ss.get('windowWidth'),this.xorThresh,snap,badge,stats);this._lastXor={ci,threshold:this.xorThresh};this.showXorStats=true;this.cdr.detectChanges();});}
  _refreshAnalysis(){if(this._lastR)this.renderRecurrence();if(this._lastP)this.renderPolar();if(this._lastP2)this.renderPolar2();if(this._lastXor)this.renderXor();}

  _buildCustomSection(){
    const n=this.ss.get('numChannels'),names=this.ss.get('sigNames');
    const body=this.channelCustomBodyRef?.nativeElement; if(!body)return;
    body.innerHTML=''; onChannelColorChange.length=0;
    onChannelColorChange.push((idx:number,color:string)=>{if(this.singleView?.updateLegendColor)this.singleView.updateLegendColor(idx,color);const dot=body.querySelector(`[data-dot="${idx}"]`) as HTMLElement;const prev=body.querySelector(`[data-prev="${idx}"]`) as HTMLElement;const inp=body.querySelector(`[data-ci="${idx}"]`) as HTMLInputElement;if(dot){dot.style.background=color;dot.style.boxShadow=`0 0 6px ${color}77`;}if(prev)prev.style.background=color;if(inp)inp.value=color;});
    for(let i=0;i<n;i++){const idx=i,dc=CHANNEL_COLORS[idx%CHANNEL_COLORS.length],cc=channelColorOverrides[idx]||dc,ct=channelThickOverrides[idx]||1.5;const card=document.createElement('div');card.style.cssText='background:var(--panel-raised);border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px 16px;width:220px;flex:0 0 220px;box-sizing:border-box;display:flex;flex-direction:column;gap:12px;overflow:hidden;';const hdr=document.createElement('div');hdr.style.cssText='display:flex;align-items:center;gap:8px;';const dot=document.createElement('div');dot.setAttribute('data-dot',String(idx));dot.style.cssText=`width:8px;height:8px;border-radius:50%;background:${cc};box-shadow:0 0 6px ${cc}77;flex-shrink:0;`;const lbl=document.createElement('span');lbl.style.cssText='font-family:var(--font-mono);font-size:10px;color:var(--text-1);letter-spacing:.06em;';lbl.textContent=names[idx]||`Lead ${idx+1}`;hdr.append(dot,lbl);const cr=document.createElement('div');cr.style.cssText='display:flex;align-items:center;gap:8px;width:100%;';const cl=document.createElement('span');cl.className='sv-cust-label';cl.textContent='Color';const sw=document.createElement('div');sw.className='sv-color-swatch';sw.title='Pick color';const ci=document.createElement('input');ci.type='color';ci.value=cc;ci.setAttribute('data-ci',String(idx));const cp=document.createElement('div');cp.className='sv-color-preview';cp.style.background=cc;cp.setAttribute('data-prev',String(idx));sw.append(cp,ci);const db=document.createElement('button');db.className='sv-btn';db.type='button';db.textContent='↺';db.title='Reset';db.style.fontSize='10px';cr.append(cl,sw,db);const tr=document.createElement('div');tr.style.cssText='display:flex;align-items:center;gap:8px;width:100%;overflow:hidden;';const tl=document.createElement('span');tl.className='sv-cust-label';tl.textContent='Width';const ts=document.createElement('input');ts.type='range';ts.min='0.5';ts.max='6';ts.step='0.5';ts.value=String(ct);ts.className='sv-thick-slider';ts.style.cssText='flex:1;min-width:0;max-width:none;';const tv=document.createElement('span');tv.className='sv-thick-val';tv.textContent=`${ct}px`;tr.append(tl,ts,tv);card.append(hdr,cr,tr);body.appendChild(card);ci.addEventListener('input',()=>setChannelColor(idx,ci.value));db.onclick=()=>{delete channelColorOverrides[idx];setChannelColor(idx,dc);};ts.addEventListener('input',()=>{const v=parseFloat(ts.value);channelThickOverrides[idx]=v;tv.textContent=`${v}px`;});}
  }

  _showError(msg: string){this.errorMsg=msg;this.showError=!!msg;this.cdr.detectChanges();}

  _resetView(){
    this.chViews.forEach(c=>c.destroy());this.chViews=[];if(this.singleView){this.singleView.destroy();this.singleView=null;}if(this.channelsContainerRef)this.channelsContainerRef.nativeElement.innerHTML='';
    this.showPlotModeChoice=false;this.showChannelCustomSection=false;this.showGlobalConfigBar=false;Object.keys(channelColorOverrides).forEach(k=>delete (channelColorOverrides as any)[k]);Object.keys(channelThickOverrides).forEach(k=>delete (channelThickOverrides as any)[k]);onChannelColorChange.length=0;
    this.showPeriodSection=false;this.showRecurrenceSection=false;this.showPolarSection=false;this.showPolar2Section=false;this.showXorSection=false;this.showMetaBar=false;this.showAiPanel=false;
    this._lastR=null;this._lastP=null;this._lastP2=null;this._lastXor=null;
    if(this._scatterView){this._scatterView.destroy();this._scatterView=null;}if(this._polarView){this._polarView.destroy();this._polarView=null;}if(this._polar2View){this._polar2View.destroy();this._polar2View=null;}if(this._digitalXorView){this._digitalXorView.destroy();this._digitalXorView=null;}
    this.showBtnSnapR=false;this.showBtnResetR=false;this.showScatterZoomBadge=false;this.showBtnSnapP=false;this.showBtnResetP=false;this.showPolarZoomBadge=false;this.showBtnSnapP2=false;this.showBtnResetP2=false;this.showPolar2ZoomBadge=false;this.showXorChunkBadge=false;this.showBtnSnapDXor=false;this.cdr.detectChanges();
  }

  // ── EEG Upload ──
  onEEGDragOver(e: DragEvent){e.preventDefault();this.eegIsDragOver=true;}
  onEEGDragLeave(){this.eegIsDragOver=false;}
  onEEGDrop(e: DragEvent){e.preventDefault();this.eegIsDragOver=false;this._handleEEGFiles(e.dataTransfer?.files??null);}
  onEEGFileChange(e: Event){this._handleEEGFiles((e.target as HTMLInputElement).files);}
  onEEGUploadClick(fi: HTMLInputElement){fi.click();}

  _handleEEGFiles(files: FileList|null){
    if(!files?.length) return;
    const arr=Array.from(files);
    const edf=arr.find(f=>f.name.toLowerCase().endsWith('.edf'));
    const hea=arr.find(f=>f.name.toLowerCase().endsWith('.hea'));
    const csv=arr.find(f=>f.name.toLowerCase().endsWith('.csv'));
    this._showEEGError('');
    if(edf) this._uploadEEG([edf]);
    else if(hea) this._uploadEEG(arr);
    else if(csv) this._readEEGCSV(csv);
    else this._showEEGError('No .edf or .hea file found. Drop a single .edf file, all WFDB record files, or a .csv for preview.');
  }

  _uploadEEG(files: File[]){
    this._resetEEGView(); this.eegIsUploading=true;
    const xhr=new XMLHttpRequest(); xhr.open('POST',`${API_BASE}/upload-eeg/`);
    xhr.onload=()=>{this.eegIsUploading=false;if(xhr.status>=200&&xhr.status<300){try{this._loadEEGData(JSON.parse(xhr.responseText));}catch(e){this._showEEGError('Server returned invalid JSON.');}}else{let m=`HTTP ${xhr.status}`;try{m=JSON.parse(xhr.responseText).error||m;}catch(_){}this._showEEGError(`Upload failed: ${m}`);}this.cdr.detectChanges();};
    xhr.onerror=()=>{this.eegIsUploading=false;this._showEEGError('Cannot reach Django server at port 8000.');this.cdr.detectChanges();};
    const fd=new FormData(); files.forEach(f=>fd.append('files',f,f.name)); xhr.send(fd);
  }

  _readEEGCSV(file: File){
    this._resetEEGView();
    const reader=new FileReader();
    reader.onload=e=>{
      const rows=(e.target!.result as string).split(/\r?\n/).filter(r=>r.trim());
      if(!rows.length){this._showEEGError('Empty CSV.');return;}
      let start=0;if(rows[0].split(',').some(v=>isNaN(parseFloat(v.trim()))))start=1;
      const n=rows[start].split(',').map(v=>parseFloat(v.trim())).filter(v=>!isNaN(v)).length;
      const ch: number[][]=Array(n).fill(null).map(()=>[]);
      for(let r=start;r<rows.length;r++){rows[r].split(',').map(v=>parseFloat(v.trim())).forEach((v,i)=>{if(i<n&&!isNaN(v))ch[i].push(v);});}
      this._loadEEGData({record_name:file.name.replace('.csv',''),fs:256,num_channels:n,total_samples:ch[0].length,sig_names:ch.map((_,i)=>`EEG${i+1}`),duration_sec:(ch[0].length/256).toFixed(2),channels:ch,ai:null,signal_type:'eeg'});
      this.cdr.detectChanges();
    };
    reader.readAsText(file);
  }

  _loadEEGData(data: any){
    const ch=data.channels||[data.signal];
    this.eegSS.set('signalData',ch); this.eegSS.set('numChannels',ch.length);
    this.eegSS.set('numSamples',ch[0].length); this.eegSS.set('fs',data.fs||256);
    this.eegSS.set('sigNames',data.sig_names||ch.map((_:any,i:number)=>`EEG${i+1}`));
    this.eegSS.set('windowWidth',Math.min(1000,ch[0].length));
    this.eegMRecord=data.record_name||'N/A'; this.eegMFs=`${data.fs||'?'} Hz`;
    this.eegMCh=`${ch.length} ch`; this.eegMDur=`${data.duration_sec||'?'} s`;
    this.eegMSamples=(data.total_samples||ch[0].length).toLocaleString();
    this.eegMNames=(data.sig_names||[]).slice(0,8).join(', ')+(ch.length>8?' …':'');
    this.eegShowMetaBar=true; this.eegShowAI=true; this.eegAIResult=null;
    if(data.ai) this._renderEEGAI(data.ai);
    this.eegShowPlotModeChoice=true; this.cdr.detectChanges();
  }

  _renderEEGAI(ai: any){
    if(!ai) return;
    const p=ai.primary||{},color=p.color||'#b794f4';
    this.eegAIResult={label:p.label||'—',sub:`${p.code||'—'} · BIOT TRANSFORMER · EEG`,description:p.description||'—',color};
    this.cdr.detectChanges();
  }

  eegActivateSeparate(){
    this.eegShowPlotModeChoice=false;this.eegShowChannelCustomSection=false;this.eegShowGlobalConfigBar=true;
    this.eegGScaleY=1;this.eegGAmpBadge='AMP ×1.00';
    const c=this.eegChannelsContainerRef.nativeElement;c.innerHTML='';
    this.eegChViews.forEach(v=>v.destroy());this.eegChViews=[];
    const n=this.eegSS.get('numChannels');
    for(let i=0;i<n;i++) this.eegChViews.push(new ChannelView(c,i,this.eegSS,this.eegAS));
    this._setupEEGAnalysis();this.cdr.detectChanges();
  }

  eegActivateSingle(){
    this.eegShowPlotModeChoice=false;this.eegShowChannelCustomSection=true;this.eegShowGlobalConfigBar=false;
    const c=this.eegChannelsContainerRef.nativeElement;c.innerHTML='';
    if(this.eegSingleView){this.eegSingleView.destroy();this.eegSingleView=null;}
    this.eegSingleView=new SingleView(c,this.eegSS,this.eegAS);
    this._setupEEGAnalysis();this.cdr.detectChanges();
  }

  eegGBtnPlay(){const s=this.eegSS.get('playbackSpeed')||1;this.eegChViews.forEach(cv=>{if(cv.paused){cv.windowStart=cv.frozenStart-this.eegAS.t*s;cv.paused=false;}});}
  eegGBtnPause(){this.eegChViews.forEach(cv=>{cv.frozenStart=cv._leftEdge(this.eegAS.t);cv.paused=true;});}
  eegGBtnAmpIn(){this.eegGScaleY=Math.min(20,this.eegGScaleY*1.5);this.eegChViews.forEach(cv=>{cv.scaleY=this.eegGScaleY;cv._updateBadge?.();});this.eegGAmpBadge=`AMP ×${this.eegGScaleY.toFixed(2)}`;}
  eegGBtnAmpOut(){this.eegGScaleY=Math.max(0.05,this.eegGScaleY/1.5);this.eegChViews.forEach(cv=>{cv.scaleY=this.eegGScaleY;cv._updateBadge?.();});this.eegGAmpBadge=`AMP ×${this.eegGScaleY.toFixed(2)}`;}
  eegGBtnReset(){this.eegGScaleY=1;this.eegChViews.forEach(cv=>{cv.scaleY=1;cv.windowStart=0;cv._updateBadge?.();});this.eegGAmpBadge='AMP ×1.00';}

  onEEGPeriodChange(e: Event){const v=parseInt((e.target as HTMLInputElement).value);this.eegPeriodValue=v;this.eegWindowInput=v;this._applyEEGWindowChange(v);}
  onEEGWindowInputChange(e: Event){const v=parseInt((e.target as HTMLInputElement).value);if(!isNaN(v)&&v>0)this._applyEEGWindowChange(v);}
  onEEGWindowInputBlur(e: Event){const v=parseInt((e.target as HTMLInputElement).value);this._applyEEGWindowChange(isNaN(v)?this.eegSS.get('windowWidth'):v);}
  _applyEEGWindowChange(v: number){v=Math.max(10,Math.min(100000,Math.round(v)));if(isNaN(v))return;this.eegPeriodValue=v;this.eegWindowInput=v;this.eegChViews.forEach(cv=>cv.anchorAndResize?.());if(this.eegSingleView)this.eegSingleView.anchorAndResize?.();this.eegSS.set('windowWidth',v);this.cdr.detectChanges();}
  onEEGSpeedChange(e: Event){this._applyEEGSpeedChange(parseFloat((e.target as HTMLInputElement).value));}
  onEEGSpeedInputChange(e: Event){const v=parseFloat((e.target as HTMLInputElement).value);if(!isNaN(v))this._applyEEGSpeedChange(v);}
  onEEGSpeedInputBlur(e: Event){const v=parseFloat((e.target as HTMLInputElement).value);this._applyEEGSpeedChange(isNaN(v)?1:v);}
  _applyEEGSpeedChange(v: number){v=Math.max(-20,Math.min(20,Math.round(v*10)/10));this.eegChViews.forEach(cv=>cv.applySpeed?.(v));if(this.eegSingleView)this.eegSingleView.applySpeed?.(v);this.eegSS.set('playbackSpeed',v);this.eegSpeedSlider=v;this.eegSpeedInput=v;this.cdr.detectChanges();}
  onEEGXorThreshChange(e: Event){this.eegXorThreshVal=(e.target as HTMLInputElement).value+'%';}

  _setupEEGAnalysis(){
    const n=this.eegSS.get('numChannels'),names=this.eegSS.get('sigNames');
    const mkOpts=(el: HTMLSelectElement|null)=>{if(!el)return;el.innerHTML='';Array.from({length:n},(_,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=names[i]||`Ch${i+1}`;el.appendChild(o);});};
    setTimeout(()=>{mkOpts(document.getElementById('eegRCh1') as HTMLSelectElement);mkOpts(document.getElementById('eegRCh2') as HTMLSelectElement);const r2=document.getElementById('eegRCh2') as HTMLSelectElement;if(r2&&n>=2)r2.selectedIndex=1;mkOpts(document.getElementById('eegPCh') as HTMLSelectElement);mkOpts(document.getElementById('eegP2Ch1') as HTMLSelectElement);mkOpts(document.getElementById('eegP2Ch2') as HTMLSelectElement);const p2=document.getElementById('eegP2Ch2') as HTMLSelectElement;if(p2&&n>=2)p2.selectedIndex=1;mkOpts(document.getElementById('eegXorCh') as HTMLSelectElement);});
    this.eegShowPeriodSection=true;this.eegShowRecurrenceSection=true;this.eegShowPolarSection=true;this.eegShowPolar2Section=true;this.eegShowXorSection=true;this.cdr.detectChanges();
  }

  eegRenderRecurrence(){const sd=this.eegSS.get('signalData'),ci=+(document.getElementById('eegRCh1') as HTMLSelectElement).value,cj=+(document.getElementById('eegRCh2') as HTMLSelectElement).value;if(!sd[ci]||!sd[cj])return;if(this.eegScatterView){this.eegScatterView.destroy();this.eegScatterView=null;}['eegBtnSnapR','eegBtnResetR'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='inline-flex';});const b=document.getElementById('eegScatterZoomBadge');if(b)b.style.display='inline-block';const canvas=this.eegRecurrenceCanvasRef?.nativeElement;if(canvas)this.eegScatterView=new ScatterView(canvas,sd[ci],sd[cj],ci,cj,this.eegAS,document.getElementById('eegBtnSnapR'),document.getElementById('eegBtnResetR'),b);this.eegLastR={ci,cj};}
  eegRenderPolar(){const sd=this.eegSS.get('signalData'),ci=+(document.getElementById('eegPCh') as HTMLSelectElement).value;if(!sd[ci]?.length)return;if(this.eegPolarView){this.eegPolarView.destroy();this.eegPolarView=null;}['eegBtnSnapP','eegBtnResetP'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='inline-flex';});const b=document.getElementById('eegPolarZoomBadge');if(b)b.style.display='inline-block';const canvas=this.eegPolarCanvasRef?.nativeElement;if(canvas)this.eegPolarView=new PolarView(canvas,sd[ci],ci,this.eegSS.get('windowWidth'),this.eegAS,document.getElementById('eegBtnSnapP'),document.getElementById('eegBtnResetP'),b);this.eegLastP={ci};}
  eegRenderPolar2(){const sd=this.eegSS.get('signalData'),ci=+(document.getElementById('eegP2Ch1') as HTMLSelectElement).value,cj=+(document.getElementById('eegP2Ch2') as HTMLSelectElement).value;if(!sd[ci]||!sd[cj])return;if(this.eegPolar2View){this.eegPolar2View.destroy();this.eegPolar2View=null;}['eegBtnSnapP2','eegBtnResetP2'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='inline-flex';});const b=document.getElementById('eegPolar2ZoomBadge');if(b)b.style.display='inline-block';const canvas=this.eegPolar2CanvasRef?.nativeElement;if(canvas)this.eegPolar2View=new PolarRatioView(canvas,sd[ci],sd[cj],ci,cj,this.eegSS.get('windowWidth'),this.eegAS,document.getElementById('eegBtnSnapP2'),document.getElementById('eegBtnResetP2'),b);this.eegLastP2={ci,cj};}
  eegRenderXor(){const sd=this.eegSS.get('signalData'),ci=+(document.getElementById('eegXorCh') as HTMLSelectElement).value,thresh=+(document.getElementById('eegXorThresh') as HTMLInputElement)?.value||8;if(!sd[ci]?.length)return;if(this.eegDigitalXorView){this.eegDigitalXorView.destroy();this.eegDigitalXorView=null;}const b=document.getElementById('eegXorChunkBadge'),stats=document.getElementById('eegXorStats'),snap=document.getElementById('eegBtnSnapDXor');if(b)b.style.display='inline-flex';const canvas=this.eegDigitalXorCanvasRef?.nativeElement;if(canvas)this.eegDigitalXorView=new DigitalXorView(canvas,sd[ci],ci,this.eegSS.get('windowWidth'),thresh,snap,b,stats);this.eegLastXor={ci,thresh};}

  _showEEGError(msg: string){this.eegErrorMsg=msg;this.eegShowError=!!msg;this.cdr.detectChanges();}

  _resetEEGView(){
    this.eegChViews.forEach(c=>c.destroy());this.eegChViews=[];if(this.eegSingleView){this.eegSingleView.destroy();this.eegSingleView=null;}if(this.eegChannelsContainerRef)this.eegChannelsContainerRef.nativeElement.innerHTML='';
    this.eegShowPlotModeChoice=false;this.eegShowChannelCustomSection=false;this.eegShowGlobalConfigBar=false;this.eegShowPeriodSection=false;this.eegShowRecurrenceSection=false;this.eegShowPolarSection=false;this.eegShowPolar2Section=false;this.eegShowXorSection=false;this.eegShowMetaBar=false;this.eegShowAI=false;this.eegAIResult=null;
    if(this.eegScatterView){this.eegScatterView.destroy();this.eegScatterView=null;}if(this.eegPolarView){this.eegPolarView.destroy();this.eegPolarView=null;}if(this.eegPolar2View){this.eegPolar2View.destroy();this.eegPolar2View=null;}if(this.eegDigitalXorView){this.eegDigitalXorView.destroy();this.eegDigitalXorView=null;}
    this.eegLastR=null;this.eegLastP=null;this.eegLastP2=null;this.eegLastXor=null;this.cdr.detectChanges();
  }
}
