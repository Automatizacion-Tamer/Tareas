import React, { useState, useEffect, useMemo, useRef } from 'react';
import htm from 'htm';
import { createClient } from '@supabase/supabase-js';
import { jsPDF } from 'jspdf';

const html = htm.bind(React.createElement);

// --- CONFIGURACIÓN SUPABASE ---
const SUPABASE_URL = 'https://mlzavdukbvxwhxetgftj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1semF2ZHVrYnZ4d2h4ZXRnZnRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2Nzc4OTAsImV4cCI6MjA4NTI1Mzg5MH0.fQp_VY1-omgx8uqaGtauugkhxdxXoKBm3VuzbMdumqM';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- CONSTANTES ---
const Role = { ADMIN: 'ADMIN', USER: 'USER' };
const TaskStatus = { 
  PENDING: 'PENDING', 
  ACCEPTED: 'ACCEPTED', 
  PAUSE_REQUESTED: 'PAUSE_REQUESTED',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED' 
};
const VERSION = "V1.9.4";

// --- UTILS ---

const formatDuration = (ms) => {
  if (isNaN(ms) || ms < 0) return "00:00:00";
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor(ms / (1000 * 60 * 60));
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const getNetWorkingTimeMs = (start, end, workingDaysConfig) => {
  if (!start || !end || !workingDaysConfig) return 0;
  let current = new Date(start);
  const limit = new Date(end);
  let totalMs = 0;
  if (current >= limit) return 0;

  while (current < limit) {
    const dayIndex = current.getDay();
    const config = workingDaysConfig[dayIndex];
    if (config && config.enabled) {
      const [startH, startM] = config.start.split(':').map(Number);
      const [endH, endM] = config.end.split(':').map(Number);
      const dayStart = new Date(current); dayStart.setHours(startH, startM, 0, 0);
      const dayEnd = new Date(current); dayEnd.setHours(endH, endM, 0, 0);
      const intervalStart = new Date(Math.max(current, dayStart));
      const intervalEnd = new Date(Math.min(limit, dayEnd));
      if (intervalStart < intervalEnd) totalMs += (intervalEnd - intervalStart);
    }
    current.setDate(current.getDate() + 1);
    current.setHours(0, 0, 0, 0);
  }
  return totalMs;
};

// Generación de PDF Individual
const generatePDFReport = (task, users, settings) => {
  const doc = new jsPDF();
  renderTaskSection(doc, task, users, 20);
  doc.save(`Reporte_Tamer_${task.title.replace(/\s+/g, '_')}.pdf`);
};

// Función auxiliar para renderizar una tarea en el PDF
const renderTaskSection = (doc, task, users, startY) => {
  const operario = users.find(u => u.id === task.assigned_to)?.username || 'No asignado';
  let pauses = []; try { pauses = typeof task.pause_history === 'string' ? JSON.parse(task.pause_history) : (task.pause_history || []); } catch(e) { pauses = []; }
  let notes = []; try { notes = typeof task.progress_notes === 'string' ? JSON.parse(task.progress_notes) : (task.progress_notes || []); } catch(e) { notes = []; }
  
  const totalPauseMs = pauses.reduce((acc, p) => acc + (p.end ? (new Date(p.end) - new Date(p.start)) : 0), 0);
  const realWorkMs = Number(task.accumulated_time_ms) || 0;

  let y = startY;

  doc.setFontSize(16); doc.setTextColor(63, 81, 181); doc.setFont(undefined, 'bold');
  const wrappedTitle = doc.splitTextToSize(`OBRA: ${task.title.toUpperCase()}`, 170);
  doc.text(wrappedTitle, 20, y);
  y += (wrappedTitle.length * 7);

  doc.setFontSize(9); doc.setTextColor(100); doc.setFont(undefined, 'normal');
  const metaLine1 = `Operario Responsable: ${operario.toUpperCase()} | Estado: ${task.status}`;
  const wrappedMeta1 = doc.splitTextToSize(metaLine1, 170);
  doc.text(wrappedMeta1, 20, y);
  y += (wrappedMeta1.length * 5);

  const metaLine2 = `Inicio: ${task.accepted_at ? new Date(task.accepted_at).toLocaleString() : 'Pendiente'} | Fin: ${task.completed_at ? new Date(task.completed_at).toLocaleString() : 'En curso'}`;
  const wrappedMeta2 = doc.splitTextToSize(metaLine2, 170);
  doc.text(wrappedMeta2, 20, y);
  y += (wrappedMeta2.length * 5) + 5;

  doc.setFillColor(245, 247, 250); doc.rect(20, y, 170, 25, 'F');
  doc.setFont(undefined, 'bold'); doc.setTextColor(0);
  doc.text(`Estimado: ${task.estimated_time} hs`, 25, y + 8);
  doc.text(`Real Neto: ${formatDuration(realWorkMs)}`, 25, y + 16);
  doc.text(`Pausas: ${formatDuration(totalPauseMs)}`, 110, y + 8);
  doc.setFontSize(12); doc.setTextColor(63, 81, 181);
  doc.text(`EFICIENCIA: ${task.efficiency || 100}%`, 110, y + 17);
  y += 35;

  doc.setFontSize(10); doc.setTextColor(0); doc.setFont(undefined, 'bold');
  doc.text("HISTORIAL DE PAUSAS", 20, y);
  y += 6;
  doc.setFont(undefined, 'normal'); doc.setFontSize(9);
  if (pauses.length === 0) {
    doc.text("- Sin interrupciones registradas.", 20, y);
    y += 8;
  } else {
    pauses.forEach((p) => {
      if (y > 270) { doc.addPage(); y = 20; }
      const dur = p.end ? formatDuration(new Date(p.end) - new Date(p.start)) : 'Sin finalizar';
      const pauseInfo = `• [${dur}] Motivo: ${p.reason || 'S/M'} (${new Date(p.start).toLocaleDateString()})`;
      const wrappedPause = doc.splitTextToSize(pauseInfo, 165);
      doc.text(wrappedPause, 20, y);
      y += (wrappedPause.length * 5);
    });
    y += 3;
  }

  if (y > 270) { doc.addPage(); y = 20; }
  doc.setFont(undefined, 'bold'); doc.setFontSize(10);
  doc.text("BITÁCORA DE AVANCES", 20, y);
  y += 6;
  doc.setFont(undefined, 'normal'); doc.setFontSize(8);
  if (notes.length === 0) {
    doc.text("- Sin registros de progreso.", 20, y);
    y += 10;
  } else {
    notes.forEach((n) => {
      if (y > 270) { doc.addPage(); y = 20; }
      const lines = doc.splitTextToSize(`[${new Date(n.date).toLocaleString()}] ${n.text}`, 165);
      doc.text(lines, 20, y);
      y += (lines.length * 4) + 2;
    });
    y += 5;
  }
  
  doc.setDrawColor(200);
  doc.line(20, y, 190, y);
  return y + 15;
};

// Generación de PDF Global
const generateGlobalPDFReport = (tasks, users, settings) => {
  const doc = new jsPDF();
  let y = 25;

  doc.setFontSize(22); doc.setTextColor(63, 81, 181); doc.setFont(undefined, 'bold');
  doc.text("TAMER INDUSTRIAL S.A.", 20, y);
  y += 10;
  doc.setFontSize(11); doc.setTextColor(100); doc.setFont(undefined, 'normal');
  doc.text("INFORME CONSOLIDADO DE PRODUCCIÓN Y EFICIENCIA", 20, y);
  y += 5;
  doc.text(`Fecha de Emisión: ${new Date().toLocaleString()}`, 20, y);
  y += 10;
  doc.line(20, y, 190, y);
  y += 15;

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === TaskStatus.COMPLETED).length;
  const avgEfficiency = tasks.length > 0 ? Math.round(tasks.reduce((acc, t) => acc + (t.efficiency || 100), 0) / tasks.length) : 100;

  doc.setFontSize(14); doc.setTextColor(0); doc.setFont(undefined, 'bold');
  doc.text("RESUMEN GENERAL DE PLANTA", 20, y);
  y += 10;
  doc.setFontSize(10); doc.setFont(undefined, 'normal');
  doc.text(`• Total de Órdenes en Sistema: ${totalTasks}`, 25, y); y += 6;
  doc.text(`• Órdenes Finalizadas: ${completedTasks}`, 25, y); y += 6;
  doc.text(`• Eficiencia Promedio Global: ${avgEfficiency}%`, 25, y); y += 15;

  doc.line(20, y, 190, y);
  y += 15;

  tasks.forEach((task, index) => {
    if (y > 220) { doc.addPage(); y = 25; }
    y = renderTaskSection(doc, task, users, y);
  });

  doc.save(`Reporte_Global_TAMER_${new Date().toISOString().split('T')[0]}.pdf`);
};

// --- COMPONENTES UI ---

const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);
  const bg = type === 'error' ? 'bg-red-600' : type === 'success' ? 'bg-emerald-600' : 'bg-indigo-600';
  return html`
    <div className=${`fixed top-6 right-6 z-[200] ${bg} text-white px-6 py-4 rounded-3xl shadow-2xl flex items-center gap-4 animate-fade-in border border-white/20`}>
      <span className="font-black text-[10px] uppercase tracking-[0.1em]">${message}</span>
      <button onClick=${onClose} className="hover:scale-110 transition-transform"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg></button>
    </div>
  `;
};

// --- DASHBOARDS ---

const UserDashboard = ({ currentUser, tasks = [], setTasks, settings, notify }) => {
  const [activeNote, setActiveNote] = useState({});
  const [pauseModal, setPauseModal] = useState({ show: false, task: null, reason: '' });
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const myTasks = useMemo(() => (tasks || []).filter(t => t.assigned_to === currentUser?.id), [tasks, currentUser]);

  const updateStatus = async (task, newStatus, extra = {}) => {
    try {
      let finalExtra = { ...extra, status: newStatus };
      
      if (task.status === TaskStatus.ACCEPTED && (newStatus === TaskStatus.PAUSE_REQUESTED || newStatus === TaskStatus.COMPLETED)) {
        const netWorkMs = getNetWorkingTimeMs(task.accepted_at, new Date().toISOString(), settings?.working_days);
        finalExtra.accumulated_time_ms = Math.floor((Number(task.accumulated_time_ms) || 0) + netWorkMs);
      }

      if (newStatus === TaskStatus.COMPLETED) {
        const totalMs = finalExtra.accumulated_time_ms || Number(task.accumulated_time_ms) || 0;
        const estMs = (task.estimated_time || 1) * 3600000;
        finalExtra.efficiency = totalMs > estMs ? Math.round((estMs / totalMs) * 100) : 100;
        finalExtra.completed_at = new Date().toISOString();
      }

      const { data, error } = await supabase.from('tasks').update(finalExtra).eq('id', task.id).select();
      if (error) throw error;
      setTasks(tasks.map(t => t.id === task.id ? data[0] : t));
      notify(`Obra: ${newStatus}`, 'success');
      setPauseModal({ show: false, task: null, reason: '' });
    } catch (e) { notify('Error al conectar con servidor', 'error'); }
  };

  const saveNote = async (id) => {
    const noteText = activeNote[id];
    if (!noteText?.trim()) return notify('Bitácora vacía', 'error');
    const task = tasks.find(t => t.id === id);
    let notes = []; try { notes = typeof task.progress_notes === 'string' ? JSON.parse(task.progress_notes || '[]') : (task.progress_notes || []); } catch (e) { notes = []; }
    const newNotes = [...notes, { text: noteText, date: new Date().toISOString() }];
    const { data, error } = await supabase.from('tasks').update({ progress_notes: JSON.stringify(newNotes) }).eq('id', id).select();
    if (!error && data) {
      setTasks(tasks.map(t => t.id === id ? data[0] : t));
      setActiveNote({ ...activeNote, [id]: '' });
      notify('Progreso guardado', 'success');
    }
  };

  return html`
    <div className="max-w-xl mx-auto space-y-6 animate-fade-in">
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-black text-slate-800 italic uppercase">Terminal Planta</h2>
        <p className="text-[10px] text-indigo-500 font-black tracking-widest uppercase mt-1">OPERARIO: ${currentUser?.username.toUpperCase()}</p>
      </div>

      ${myTasks.length === 0 ? html`<div className="p-20 text-center bg-white rounded-[40px] border-2 border-dashed border-slate-200 text-slate-300 font-black uppercase text-xs">Sin órdenes de trabajo</div>` : myTasks.map(t => {
        const currentWorkMs = t.status === TaskStatus.ACCEPTED ? getNetWorkingTimeMs(t.accepted_at, now.toISOString(), settings?.working_days) : 0;
        const totalRealMs = (Number(t.accumulated_time_ms) || 0) + currentWorkMs;

        return html`
          <div key=${t.id} className="bg-white rounded-[32px] shadow-sm border border-slate-200 overflow-hidden mb-6">
            <div className="p-6 border-b border-slate-50 flex justify-between items-start">
              <div className="flex-1">
                <h3 className="font-black text-slate-800 text-lg uppercase">${t.title}</h3>
                <div className="flex gap-2 mt-2">
                   <span className="bg-indigo-50 text-[9px] font-black text-indigo-600 px-2 py-1 rounded border border-indigo-100">TIEMPO: ${formatDuration(totalRealMs)}</span>
                   <span className="bg-slate-100 text-[9px] font-black text-slate-500 px-2 py-1 rounded">EST: ${t.estimated_time}HS</span>
                </div>
              </div>
              <span className=${`text-[9px] font-black px-3 py-1 rounded-full uppercase ${t.status === TaskStatus.COMPLETED ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>${t.status}</span>
            </div>

            <div className="p-6 space-y-6">
               <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <span className="text-[8px] font-black text-slate-400 block uppercase mb-1">Descripción técnica</span>
                  <p className="text-sm text-slate-600 italic leading-relaxed">"${t.description}"</p>
               </div>
               
               <div className="space-y-4">
                 ${t.status === TaskStatus.PENDING && html`<button onClick=${() => updateStatus(t, TaskStatus.ACCEPTED, { accepted_at: new Date().toISOString() })} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase text-xs shadow-xl shadow-indigo-100">Iniciar Jornada</button>`}
                 
                 ${t.status === TaskStatus.ACCEPTED && html`
                   <div className="space-y-4">
                     <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                        <textarea placeholder="¿Qué avances lograste?..." value=${activeNote[t.id] || ''} onChange=${e => setActiveNote({...activeNote, [t.id]: e.target.value})} className="w-full p-3 bg-slate-50 border-0 rounded-xl text-sm min-h-[80px] outline-none" />
                        <button onClick=${() => saveNote(t.id)} className="w-full bg-slate-800 text-white py-3 rounded-xl text-[10px] font-black uppercase">Reportar Avance</button>
                     </div>
                     <div className="grid grid-cols-2 gap-3">
                        <button onClick=${() => setPauseModal({ show: true, task: t, reason: '' })} className="bg-amber-500 text-white py-4 rounded-2xl font-black uppercase text-[10px] shadow-lg shadow-amber-100">Solicitar Pausa</button>
                        <button onClick=${() => updateStatus(t, TaskStatus.COMPLETED)} className="bg-emerald-600 text-white py-4 rounded-2xl font-black uppercase text-[10px] shadow-lg shadow-emerald-100">Finalizar Obra</button>
                     </div>
                   </div>
                 `}

                 ${t.status === TaskStatus.PAUSE_REQUESTED && html`<div className="p-8 bg-amber-50 rounded-2xl border border-amber-100 text-center animate-pulse"><span className="font-black text-amber-600 uppercase text-[10px] tracking-widest block">Esperando Aprobación de Pausa...</span></div>`}
                 ${t.status === TaskStatus.PAUSED && html`<div className="p-8 bg-red-50 rounded-2xl border border-red-100 text-center"><span className="font-black text-red-600 uppercase text-[10px] tracking-widest block italic">OBRA EN PAUSA POR ADMINISTRACIÓN</span></div>`}
                 ${t.status === TaskStatus.COMPLETED && html`<div className="p-10 bg-emerald-50 rounded-[40px] text-center border border-emerald-100 border-dashed"><span className="block font-black text-4xl text-emerald-600">${t.efficiency || 100}%</span><span className="text-[10px] text-emerald-400 font-black uppercase mt-2 block tracking-widest">Eficiencia Lograda</span></div>`}
               </div>
            </div>
          </div>
        `;
      })}

      <!-- MODAL MOTIVO PAUSA -->
      ${pauseModal.show && html`
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[150] flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] w-full max-w-sm shadow-2xl p-10 animate-fade-in-up">
            <h2 className="text-xl font-black mb-6 uppercase text-amber-600 italic tracking-tighter">Motivo de la Pausa</h2>
            <textarea placeholder="Ej: Falta de material, almuerzo, problemas técnicos..." value=${pauseModal.reason} onChange=${e => setPauseModal({...pauseModal, reason: e.target.value})} className="w-full p-4 bg-slate-50 border-0 ring-1 ring-slate-100 rounded-2xl text-sm min-h-[120px] outline-none mb-6" />
            <div className="flex gap-3">
              <button onClick=${() => setPauseModal({show:false, task:null, reason:''})} className="flex-1 bg-slate-100 py-4 rounded-2xl font-black text-[10px] uppercase text-slate-400">Cancelar</button>
              <button disabled=${!pauseModal.reason.trim()} onClick=${() => updateStatus(pauseModal.task, TaskStatus.PAUSE_REQUESTED, { current_pause_reason: pauseModal.reason })} className="flex-1 bg-amber-500 text-white py-4 rounded-2xl font-black text-[10px] uppercase shadow-lg disabled:opacity-30">Enviar Solicitud</button>
            </div>
          </div>
        </div>
      `}
    </div>
  `;
};

const AdminDashboard = ({ users = [], setUsers, tasks = [], setTasks, settings, setSettings, notify, confirm }) => {
  const [view, setView] = useState('TASKS');
  const [modalTask, setModalTask] = useState({ show: false, mode: 'create', data: null });
  const [modalUser, setModalUser] = useState({ show: false, mode: 'create', data: null });
  const [modalNotes, setModalNotes] = useState({ show: false, task: null });
  
  const [taskForm, setTaskForm] = useState({ title: '', description: '', assigned_to: '', estimated_time: 1 });
  const [userForm, setUserForm] = useState({ username: '', password: '', role: Role.USER });

  const pendingRequests = useMemo(() => tasks.filter(t => t.status === TaskStatus.PAUSE_REQUESTED), [tasks]);

  const saveUser = async (e) => {
    e.preventDefault();
    try {
      if (modalUser.mode === 'edit') {
        const { data, error } = await supabase.from('users').update(userForm).eq('id', modalUser.data.id).select();
        if (error) throw error;
        setUsers(users.map(u => u.id === modalUser.data.id ? data[0] : u));
        notify('Operario actualizado', 'success');
      } else {
        const { data, error } = await supabase.from('users').insert([userForm]).select();
        if (error) throw error;
        setUsers([...users, data[0]]);
        notify('Operario registrado', 'success');
      }
      setModalUser({ show: false });
    } catch (err) { notify('Error de usuario', 'error'); }
  };

  const deleteUser = (user) => {
    confirm('¿Eliminar Operario?', `Se borrará a ${user.username}. Esta acción es irreversible.`, async () => {
      const { error } = await supabase.from('users').delete().eq('id', user.id);
      if (!error) {
        setUsers(users.filter(u => u.id !== user.id));
        notify('Operario eliminado', 'success');
      } else {
        notify('Error: No se puede borrar si tiene tareas', 'error');
      }
    });
  };

  const saveTask = async (e) => {
    e.preventDefault();
    try {
      if (modalTask.mode === 'edit') {
        const { data, error } = await supabase.from('tasks').update(taskForm).eq('id', modalTask.data.id).select();
        if (error) throw error;
        setTasks(tasks.map(t => t.id === modalTask.data.id ? data[0] : t));
        notify('Tarea actualizada', 'success');
      } else {
        const { data, error } = await supabase.from('tasks').insert([{ ...taskForm, status: TaskStatus.PENDING, progress_notes: '[]', pause_history: '[]', efficiency: 100, accumulated_time_ms: 0 }]).select();
        if (error) throw error;
        setTasks([data[0], ...tasks]);
        notify('Obra lanzada', 'success');
      }
      setModalTask({ show: false });
    } catch (err) { notify('Error de base de datos', 'error'); }
  };

  const managePause = async (task, approved) => {
    let updateData = {};
    if (approved) {
      const history = typeof task.pause_history === 'string' ? JSON.parse(task.pause_history) : (task.pause_history || []);
      const newHistory = [...history, { start: new Date().toISOString(), end: null, reason: task.current_pause_reason }];
      updateData = { 
        status: TaskStatus.PAUSED, 
        pause_history: JSON.stringify(newHistory),
        current_pause_reason: null
      };
    } else {
      updateData = { 
        status: TaskStatus.ACCEPTED, 
        accepted_at: new Date().toISOString(),
        current_pause_reason: null
      };
    }
    const { data, error } = await supabase.from('tasks').update(updateData).eq('id', task.id).select();
    if (!error) setTasks(tasks.map(t => t.id === task.id ? data[0] : t));
  };

  const resumeTask = async (task) => {
    const history = typeof task.pause_history === 'string' ? JSON.parse(task.pause_history) : (task.pause_history || []);
    if (history.length > 0) {
      history[history.length - 1].end = new Date().toISOString();
    }
    const { data, error } = await supabase.from('tasks').update({ 
      status: TaskStatus.ACCEPTED, 
      accepted_at: new Date().toISOString(),
      pause_history: JSON.stringify(history)
    }).eq('id', task.id).select();
    if (!error) {
       setTasks(tasks.map(t => t.id === task.id ? data[0] : t));
       notify('Tarea reanudada', 'success');
    }
  };

  const saveSettings = async () => {
    const { error } = await supabase.from('settings').upsert(settings);
    if (!error) notify('Configuración guardada', 'success');
  };

  return html`
    <div className="space-y-6 animate-fade-in pb-10">
      
      <!-- SOLICITUDES CRÍTICAS -->
      ${pendingRequests.length > 0 && html`
        <div className="bg-amber-600 text-white p-8 rounded-[40px] shadow-2xl flex flex-col gap-6 border-4 border-amber-400">
          <div className="flex items-center gap-4">
            <span className="bg-white/20 p-3 rounded-2xl animate-pulse"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="3" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg></span>
            <h3 className="font-black text-lg uppercase italic tracking-tighter">Solicitudes de Pausa Pendientes</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${pendingRequests.map(t => html`
              <div key=${t.id} className="bg-white/10 p-6 rounded-3xl border border-white/20">
                <p className="text-sm font-black uppercase mb-1 truncate">${t.title}</p>
                <p className="text-[10px] font-bold text-amber-200 mb-3 uppercase">OPERARIO: ${users.find(u => u.id === t.assigned_to)?.username}</p>
                <div className="bg-black/20 p-3 rounded-xl mb-4">
                   <p className="text-[9px] font-black uppercase text-white/50 mb-1">Motivo:</p>
                   <p className="text-xs italic">"${t.current_pause_reason || 'Sin motivo reportado'}"</p>
                </div>
                <div className="flex gap-2">
                  <button onClick=${() => managePause(t, true)} className="flex-1 bg-white text-amber-600 py-3 rounded-xl text-[10px] font-black uppercase">Aprobar</button>
                  <button onClick=${() => managePause(t, false)} className="flex-1 bg-black/30 text-white py-3 rounded-xl text-[10px] font-black uppercase">Rechazar</button>
                </div>
              </div>
            `)}
          </div>
        </div>
      `}

      <!-- NAVEGACIÓN -->
      <div className="flex flex-wrap items-center justify-between gap-4 p-1.5 bg-white border border-slate-200 rounded-2xl sticky top-20 z-40 shadow-sm backdrop-blur-md px-4">
        <div className="flex gap-2">
          <button onClick=${() => setView('TASKS')} className=${`px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${view === 'TASKS' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>Obras</button>
          <button onClick=${() => setView('USERS')} className=${`px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${view === 'USERS' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>Personal</button>
          <button onClick=${() => setView('SETTINGS')} className=${`px-6 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${view === 'SETTINGS' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>Ajustes</button>
        </div>
        ${view === 'TASKS' && html`
           <button onClick=${() => generateGlobalPDFReport(tasks, users, settings)} className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-emerald-100 flex items-center gap-2 hover:bg-emerald-700 transition-colors">
             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="3" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
             Exportar Reporte Global
           </button>
        `}
      </div>

      <!-- VISTA OBRAS -->
      ${view === 'TASKS' && html`
        <div className="bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-8 flex justify-between items-center border-b bg-slate-50/30">
            <h2 className="font-black text-slate-800 uppercase italic text-xl">Monitor de Obras</h2>
            <button onClick=${() => { setTaskForm({title:'', description:'', assigned_to:'', estimated_time:1}); setModalTask({show:true, mode:'create'}); }} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase shadow-xl">+ Nueva Orden</button>
          </div>
          <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            ${tasks.map(t => {
              const realMs = (Number(t.accumulated_time_ms) || 0) + (t.status === TaskStatus.ACCEPTED ? getNetWorkingTimeMs(t.accepted_at, new Date().toISOString(), settings?.working_days) : 0);
              return html`
                <div key=${t.id} className="p-6 border rounded-[32px] bg-white group hover:border-indigo-200 transition-all shadow-sm flex flex-col justify-between min-h-[320px]">
                  <div>
                    <div className="flex flex-col gap-2 mb-4">
                      <h3 className="font-black text-slate-800 text-sm uppercase leading-tight whitespace-normal break-words">${t.title}</h3>
                      <div className="flex items-center gap-2">
                        <span className=${`text-[8px] font-black px-2 py-0.5 rounded uppercase inline-block ${t.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'}`}>${t.status}</span>
                      </div>
                    </div>
                    
                    <!-- Métricas -->
                    <div className="grid grid-cols-3 gap-2 py-4 border-y border-slate-50 mb-4 bg-slate-50/50 rounded-2xl px-3">
                      <div className="flex flex-col"><span className="text-[8px] text-slate-400 font-black uppercase">Neto</span><span className="text-xs font-black text-indigo-600 font-mono">${formatDuration(realMs)}</span></div>
                      <div className="flex flex-col"><span className="text-[8px] text-slate-400 font-black uppercase">Efi.</span><span className="text-xs font-black text-emerald-600">${t.efficiency || 100}%</span></div>
                      <div className="flex flex-col"><span className="text-[8px] text-slate-400 font-black uppercase">Oper.</span><span className="text-[9px] font-black text-slate-700 truncate">${users.find(u => u.id === t.assigned_to)?.username || '---'}</span></div>
                    </div>
                  </div>

                  <!-- Área Inferior: Botones de Acción -->
                  <div className="mt-auto pt-4 space-y-3">
                    <div className="flex justify-between items-center gap-2 border-t border-slate-50 pt-3">
                      <div className="flex gap-1.5">
                        <button onClick=${() => setModalNotes({show:true, task:t})} className="text-indigo-600 bg-indigo-50 p-2.5 rounded-xl hover:bg-indigo-100 transition-colors" title="Ver Detalles">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        </button>
                        <button onClick=${() => generatePDFReport(t, users, settings)} className="text-emerald-600 bg-emerald-50 p-2.5 rounded-xl hover:bg-emerald-100 transition-colors" title="Exportar PDF">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="3" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        </button>
                      </div>
                      <button onClick=${() => confirm('¿Borrar Tarea?', 'Esta acción no se puede deshacer.', async () => { await supabase.from('tasks').delete().eq('id', t.id); setTasks(tasks.filter(x => x.id !== t.id)); notify('Tarea eliminada', 'success'); })} className="text-red-500 bg-red-50 p-2.5 rounded-xl hover:bg-red-100 transition-colors" title="Eliminar">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>

                    ${t.status === TaskStatus.PAUSED && html`<button onClick=${() => resumeTask(t)} className="w-full bg-slate-900 text-white py-3 rounded-2xl text-[9px] font-black uppercase shadow-lg transition-all active:scale-95">Reanudar Jornada</button>`}
                    ${t.status === TaskStatus.ACCEPTED && html`<p className="text-center text-[8px] font-black text-indigo-400 uppercase tracking-widest animate-pulse italic py-1">Ejecución en Planta...</p>`}
                  </div>
                </div>
              `;
            })}
          </div>
        </div>
      `}

      <!-- VISTA PERSONAL -->
      ${view === 'USERS' && html`
        <div className="bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-8 flex justify-between items-center border-b bg-slate-50/30">
             <h2 className="font-black text-slate-800 uppercase italic text-xl">Gestión de Personal</h2>
             <button onClick=${() => { setUserForm({username:'', password:'', role: Role.USER}); setModalUser({show:true, mode:'create'}); }} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase shadow-xl">+ Nuevo Operario</button>
          </div>
          <div className="p-8 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre de Usuario</th>
                  <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Rol</th>
                  <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Gestión</th>
                </tr>
              </thead>
              <tbody>
                ${users.map(u => html`
                  <tr key=${u.id} className="border-b border-slate-50 group hover:bg-slate-50/50 transition-colors">
                    <td className="py-5 font-black text-slate-700 uppercase text-sm italic">${u.username}</td>
                    <td className="py-5 text-center">
                       <span className=${`text-[9px] font-black px-3 py-1 rounded-lg uppercase ${u.role === 'ADMIN' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`}>${u.role}</span>
                    </td>
                    <td className="py-5 text-right">
                       <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-all">
                          <button onClick=${() => { setUserForm({username:u.username, password:u.password, role:u.role}); setModalUser({show:true, mode:'edit', data:u}); }} className="bg-indigo-50 text-indigo-600 p-2 rounded-xl hover:bg-indigo-100 transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg></button>
                          ${u.username !== 'admin' && html`<button onClick=${() => deleteUser(u)} className="bg-red-50 text-red-600 p-2 rounded-xl hover:bg-red-100 transition-all"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>`}
                       </div>
                    </td>
                  </tr>
                `)}
              </tbody>
            </table>
          </div>
        </div>
      `}

      <!-- VISTA CONFIGURACIÓN -->
      ${view === 'SETTINGS' && html`
        <div className="bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-8 border-b bg-slate-50/30">
            <h2 className="font-black text-slate-800 uppercase italic text-xl">Configuración de Planta</h2>
          </div>
          <div className="p-8 space-y-8">
            <div>
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">Horarios de Trabajo (Neto)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                ${[1, 2, 3, 4, 5, 6, 0].map(day => {
                  const dayName = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][day];
                  const config = settings?.working_days?.[day] || { enabled: false, start: '08:00', end: '17:00' };
                  return html`
                    <div key=${day} className="flex items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <input type="checkbox" checked=${config.enabled} onChange=${e => setSettings({...settings, working_days: {...settings.working_days, [day]: {...config, enabled: e.target.checked}}})} className="w-5 h-5 accent-indigo-600" />
                      <span className="text-xs font-black uppercase text-slate-700 w-24">${dayName}</span>
                      <div className="flex gap-2 items-center">
                        <input type="time" value=${config.start} onChange=${e => setSettings({...settings, working_days: {...settings.working_days, [day]: {...config, start: e.target.value}}})} className="bg-white border-0 text-[10px] font-bold p-1 rounded ring-1 ring-slate-200 outline-none" />
                        <span className="text-[10px] text-slate-300">-</span>
                        <input type="time" value=${config.end} onChange=${e => setSettings({...settings, working_days: {...settings.working_days, [day]: {...config, end: e.target.value}}})} className="bg-white border-0 text-[10px] font-bold p-1 rounded ring-1 ring-slate-200 outline-none" />
                      </div>
                    </div>
                  `;
                })}
              </div>
            </div>
            <button onClick=${saveSettings} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase text-xs shadow-xl active:scale-95 transition-all">Guardar Configuración Global</button>
          </div>
        </div>
      `}

      <!-- MODALES ADMIN -->
      ${modalTask.show && html`
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] w-full max-w-md shadow-2xl p-10 animate-fade-in-up">
            <h2 className="text-2xl font-black mb-8 uppercase text-indigo-700 italic tracking-tighter">${modalTask.mode === 'edit' ? 'Editar Orden' : 'Nueva Orden'}</h2>
            <form onSubmit=${saveTask} className="space-y-5">
              <input className="w-full bg-slate-50 p-4 rounded-2xl ring-1 ring-slate-100 outline-none font-bold text-sm" placeholder="Nombre de la Obra" value=${taskForm.title} onChange=${e => setTaskForm({...taskForm, title: e.target.value})} required />
              <div className="grid grid-cols-2 gap-4">
                <select className="w-full bg-slate-50 p-4 rounded-2xl ring-1 ring-slate-100 outline-none font-bold text-[10px] uppercase" value=${taskForm.assigned_to} onChange=${e => setTaskForm({...taskForm, assigned_to: e.target.value})} required>
                  <option value="">ASIGNAR A...</option>
                  ${users.filter(u => u.role === Role.USER).map(u => html`<option key=${u.id} value=${u.id}>${u.username.toUpperCase()}</option>`)}
                </select>
                <input type="number" step="0.5" className="w-full bg-slate-50 p-4 rounded-2xl ring-1 ring-slate-100 outline-none font-bold" placeholder="Horas Est." value=${taskForm.estimated_time} onChange=${e => setTaskForm({...taskForm, estimated_time: parseFloat(e.target.value)})} required />
              </div>
              <textarea className="w-full bg-slate-50 p-4 rounded-2xl ring-1 ring-slate-100 outline-none min-h-[120px] text-sm leading-relaxed" placeholder="Especificaciones y requerimientos técnicos..." value=${taskForm.description} onChange=${e => setTaskForm({...taskForm, description: e.target.value})} required />
              <div className="flex gap-3 pt-6">
                <button type="button" onClick=${() => setModalTask({show:false})} className="flex-1 bg-slate-100 py-4 rounded-2xl font-black text-xs uppercase text-slate-400">Cerrar</button>
                <button type="submit" className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-black text-xs uppercase shadow-xl">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      `}

      ${modalUser.show && html`
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] w-full max-w-sm shadow-2xl p-10 animate-fade-in-up">
            <h2 className="text-2xl font-black mb-8 uppercase text-indigo-700 italic tracking-tighter">${modalUser.mode === 'edit' ? 'Editar Perfil' : 'Nuevo Operario'}</h2>
            <form onSubmit=${saveUser} className="space-y-5">
              <input className="w-full bg-slate-50 p-4 rounded-2xl ring-1 ring-slate-100 outline-none font-bold" placeholder="Identificador / Usuario" value=${userForm.username} onChange=${e => setUserForm({...userForm, username: e.target.value.toLowerCase()})} required />
              <input type="password" className="w-full bg-slate-50 p-4 rounded-2xl ring-1 ring-slate-100 outline-none font-bold" placeholder="Contraseña segura" value=${userForm.password} onChange=${e => setUserForm({...userForm, password: e.target.value})} required />
              <select className="w-full bg-slate-50 p-4 rounded-2xl ring-1 ring-slate-100 outline-none font-bold text-xs uppercase" value=${userForm.role} onChange=${e => setUserForm({...userForm, role: e.target.value})} required>
                <option value=${Role.USER}>ROL: OPERARIO</option>
                <option value=${Role.ADMIN}>ROL: ADMINISTRADOR</option>
              </select>
              <div className="flex gap-3 pt-6">
                <button type="button" onClick=${() => setModalUser({show:false})} className="flex-1 bg-slate-100 py-4 rounded-2xl font-black text-xs uppercase text-slate-400">Cerrar</button>
                <button type="submit" className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-black text-xs uppercase shadow-xl">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      `}

      ${modalNotes.show && html`
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] w-full max-w-2xl shadow-2xl p-10 animate-fade-in-up flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-start mb-8">
               <h2 className="text-2xl font-black uppercase text-indigo-700 italic tracking-tighter">Detalles de Obra</h2>
               <button onClick=${() => generatePDFReport(modalNotes.task, users, settings)} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase shadow-lg">Descargar Reporte</button>
            </div>
            
            <div className="overflow-y-auto space-y-8 pr-4 custom-scrollbar">
               <div>
                 <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Métricas de Tiempo</h4>
                 <div className="grid grid-cols-2 gap-4">
                   <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                     <span className="text-[8px] font-black text-slate-400 block uppercase">Trabajo Neto</span>
                     <span className="text-lg font-black text-indigo-600">${formatDuration(Number(modalNotes.task.accumulated_time_ms))}</span>
                   </div>
                   <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                     <span className="text-[8px] font-black text-slate-400 block uppercase">Tiempo Estimado</span>
                     <span className="text-lg font-black text-slate-800">${modalNotes.task.estimated_time}HS</span>
                   </div>
                 </div>
               </div>

               <div>
                 <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Historial Detallado de Pausas</h4>
                 <div className="space-y-3">
                   ${(() => {
                     const pauses = typeof modalNotes.task.pause_history === 'string' ? JSON.parse(modalNotes.task.pause_history) : (modalNotes.task.pause_history || []);
                     if (pauses.length === 0) return html`<p className="text-xs text-slate-300 italic">No se registraron pausas.</p>`;
                     return pauses.map((p, i) => html`
                       <div key=${i} className="bg-amber-50/50 p-4 rounded-2xl border border-amber-100">
                         <div className="flex justify-between items-start mb-2">
                           <span className="text-[10px] font-black text-amber-700 uppercase">Motivo: ${p.reason}</span>
                           <span className="text-[9px] font-mono text-amber-500">${p.end ? formatDuration(new Date(p.end) - new Date(p.start)) : 'En curso'}</span>
                         </div>
                         <p className="text-[9px] text-slate-400 font-bold uppercase">Inicio: ${new Date(p.start).toLocaleString()}</p>
                         ${p.end && html`<p className="text-[9px] text-slate-400 font-bold uppercase">Retoma: ${new Date(p.end).toLocaleString()}</p>`}
                       </div>
                     `);
                   })()}
                 </div>
               </div>

               <div>
                 <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Bitácora de Avances</h4>
                 <div className="space-y-3">
                   ${(() => {
                     const notes = typeof modalNotes.task.progress_notes === 'string' ? JSON.parse(modalNotes.task.progress_notes) : (modalNotes.task.progress_notes || []);
                     if (notes.length === 0) return html`<p className="text-xs text-slate-300 italic">Sin avances reportados.</p>`;
                     return notes.map((n, i) => html`
                       <div key=${i} className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                         <p className="text-sm text-slate-700 leading-tight">${n.text}</p>
                         <p className="text-[9px] text-slate-400 font-black mt-2 font-mono">${new Date(n.date).toLocaleString()}</p>
                       </div>
                     `);
                   })()}
                 </div>
               </div>
            </div>
            <button onClick=${() => setModalNotes({show:false})} className="w-full mt-8 bg-slate-900 text-white py-4 rounded-2xl font-black text-xs uppercase">Cerrar</button>
          </div>
        </div>
      `}
    </div>
  `;
};

// --- APP PRINCIPAL ---
const App = () => {
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('automatizacion_session');
    return saved ? JSON.parse(saved) : null;
  });
  const [users, setUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [settings, setSettings] = useState({ working_days: {} });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [confirmation, setConfirmation] = useState({ show: false, title: '', message: '', onConfirm: null });

  const notify = (message, type = 'info') => setToast({ message, type });
  const confirm = (title, message, onConfirm) => {
    setConfirmation({ show: true, title, message, onConfirm: () => { onConfirm(); setConfirmation(c => ({...c, show: false})); } });
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: u } = await supabase.from('users').select('*').order('username');
      const { data: t } = await supabase.from('tasks').select('*').order('created_at', { ascending: false });
      const { data: s } = await supabase.from('settings').select('*').maybeSingle();
      setUsers(u || []); 
      setTasks(t || []); 
      if (s) setSettings(s);
    } catch (err) { console.error("Sync Error:", err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) return html`<div className="h-screen flex items-center justify-center bg-indigo-950 text-white font-black uppercase italic animate-pulse">Sincronizando Planta Industrial...</div>`;
  
  if (!currentUser) return html`
    <div className="h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="bg-white p-12 rounded-[50px] shadow-2xl w-full max-w-sm border border-slate-200 animate-fade-in-up">
        <h1 className="text-4xl font-black text-center text-indigo-700 italic uppercase mb-2 tracking-tighter leading-none">TAMER IND.</h1>
        <p className="text-[9px] text-center text-slate-400 font-black uppercase tracking-[0.3em] mb-12">Industrial Control System</p>
        <form onSubmit=${(e) => {
          e.preventDefault();
          const user = users.find(x => x.username.toLowerCase() === e.target.u.value.toLowerCase() && x.password === e.target.p.value);
          if (user) {
            localStorage.setItem('automatizacion_session', JSON.stringify(user));
            setCurrentUser(user);
          } else { notify('Credenciales incorrectas', 'error'); }
        }} className="space-y-4">
          <input name="u" className="w-full p-4 bg-slate-50 ring-1 ring-slate-200 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-indigo-600 transition-all text-sm" placeholder="Usuario de Planta" required />
          <input name="p" type="password" className="w-full p-4 bg-slate-50 ring-1 ring-slate-200 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-indigo-600 transition-all text-sm" placeholder="Clave" required />
          <button type="submit" className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase shadow-xl shadow-indigo-100 active:scale-95 transition-all mt-6">Ingresar</button>
        </form>
      </div>
    </div>
  `;

  return html`
    <div className="min-h-screen bg-slate-50 pb-20">
      <nav className="bg-white/80 backdrop-blur-md border-b px-8 py-5 sticky top-0 z-50 shadow-sm flex justify-between items-center">
        <div className="flex items-center gap-4">
           <div className="w-12 h-12 bg-indigo-700 rounded-2xl flex items-center justify-center text-white font-black italic shadow-xl text-xl">T</div>
           <div className="hidden sm:block">
              <h1 className="text-xl font-black text-indigo-900 italic uppercase tracking-tighter leading-none">TAMER</h1>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Control Industrial</p>
           </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right hidden md:block">
            <p className="text-[10px] font-black uppercase text-slate-800 leading-none">${currentUser.username}</p>
            <p className="text-[8px] text-indigo-500 font-black uppercase tracking-widest mt-1">${currentUser.role}</p>
          </div>
          <button onClick=${() => confirm('Cerrar Sesión', '¿Desea desconectar este terminal?', () => { localStorage.removeItem('automatizacion_session'); setCurrentUser(null); })} className="p-3 bg-slate-100 rounded-2xl text-slate-400 hover:text-red-500 border border-slate-200 transition-all active:scale-90"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="3" d="M17 16l4-4m4 4H7"/></svg></button>
        </div>
      </nav>
      <main className="max-w-6xl mx-auto p-6">
        ${currentUser.role === Role.ADMIN ? html`<${AdminDashboard} users=${users} setUsers=${setUsers} tasks=${tasks} setTasks=${setTasks} settings=${settings} setSettings=${setSettings} notify=${notify} confirm=${confirm} />` : html`<${UserDashboard} currentUser=${currentUser} tasks=${tasks} setTasks=${setTasks} settings=${settings} notify=${notify} />`}
      </main>
      <footer className="fixed bottom-0 left-0 right-0 p-4 bg-white/50 backdrop-blur-md border-t border-slate-100 flex justify-between items-center px-10 z-[60]">
        <div className="text-[8px] text-slate-300 font-black uppercase tracking-widest italic">Industrial efficiency data management system</div>
        <div className="text-[9px] text-indigo-400 font-black bg-indigo-50 px-3 py-1 rounded-full uppercase border border-indigo-100">${VERSION}</div>
      </footer>
      ${toast && html`<${Toast} message=${toast.message} type=${toast.type} onClose=${() => setToast(null)} />`}
      <div className=${confirmation.show ? 'fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[150] flex items-center justify-center p-4' : 'hidden'}>
        <div className="bg-white rounded-[40px] w-full max-w-sm shadow-2xl p-10 animate-fade-in-up">
          <h2 className="text-xl font-black mb-4 uppercase text-slate-800 italic tracking-tighter">${confirmation.title}</h2>
          <p className="text-sm text-slate-500 mb-8 leading-relaxed">${confirmation.message}</p>
          <div className="flex gap-3">
            <button onClick=${() => setConfirmation(c => ({...c, show: false}))} className="flex-1 bg-slate-100 py-4 rounded-2xl font-black text-[10px] uppercase text-slate-400">Cancelar</button>
            <button onClick=${confirmation.onConfirm} className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-black text-[10px] uppercase shadow-lg shadow-indigo-100">Confirmar</button>
          </div>
        </div>
      </div>
    </div>
    <style>${`
      @keyframes fade-in-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      .animate-fade-in-up { animation: fade-in-up 0.5s cubic-bezier(0.16, 1, 0.3, 1); }
      @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
      .animate-fade-in { animation: fade-in 0.4s ease-out; }
      .custom-scrollbar::-webkit-scrollbar { width: 4px; }
      .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    `}</style>
  `;
};

export default App;
