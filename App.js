import React, { useState, useEffect, useMemo, useRef } from 'react';
import htm from 'htm';
import { createClient } from '@supabase/supabase-js';

const html = htm.bind(React.createElement);

// --- CONFIGURACIÓN SUPABASE ---
const SUPABASE_URL = 'https://mlzavdukbvxwhxetgftj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1semF2ZHVrYnZ4d2h4ZXRnZnRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2Nzc4OTAsImV4cCI6MjA4NTI1Mzg5MH0.fQp_VY1-omgx8uqaGtauugkhxdxXoKBm3VuzbMdumqM';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- CONSTANTES ---
const Role = { ADMIN: 'ADMIN', USER: 'USER' };
const TaskStatus = { PENDING: 'PENDING', ACCEPTED: 'ACCEPTED', COMPLETED: 'COMPLETED' };
const VERSION = "V1.5.3";

// --- UTILS ---
const formatDuration = (ms) => {
  if (isNaN(ms) || ms < 0) return "00:00:00";
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor(ms / (1000 * 60 * 60));
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const calculateEfficiency = (estimatedHours, acceptedAt, completedAt) => {
  if (!acceptedAt || !completedAt || !estimatedHours) return 100;
  const actualMs = new Date(completedAt) - new Date(acceptedAt);
  const estimatedMs = estimatedHours * 60 * 60 * 1000;
  if (actualMs <= 0) return 100;
  if (actualMs <= estimatedMs) return 100;
  return Math.max(0, Math.round((estimatedMs / actualMs) * 100));
};

// --- COMPONENTES UI ---

const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);
  const bg = type === 'error' ? 'bg-red-500' : type === 'success' ? 'bg-emerald-500' : 'bg-indigo-600';
  return html`
    <div className=${`fixed top-6 right-6 z-[200] ${bg} text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-bounce-short`}>
      <span className="font-black text-xs uppercase tracking-widest">${message}</span>
      <button onClick=${onClose} className="opacity-50 hover:opacity-100"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg></button>
    </div>
  `;
};

const ConfirmModal = ({ show, title, message, onConfirm, onCancel }) => {
  if (!show) return null;
  return html`
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
      <div className="bg-white rounded-[40px] w-full max-w-sm shadow-2xl p-10 animate-fade-in-up">
        <h2 className="text-xl font-black mb-4 uppercase text-slate-800">${title}</h2>
        <p className="text-sm text-slate-500 mb-8">${message}</p>
        <div className="flex gap-3">
          <button onClick=${onCancel} className="flex-1 bg-slate-100 py-4 rounded-2xl font-black text-xs uppercase text-slate-400">Cancelar</button>
          <button onClick=${onConfirm} className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-black text-xs uppercase">Confirmar</button>
        </div>
      </div>
    </div>
  `;
};

const Timer = ({ startTime }) => {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = new Date(startTime).getTime();
    if (isNaN(start)) return;
    const interval = setInterval(() => setElapsed(Date.now() - start), 1000);
    return () => clearInterval(interval);
  }, [startTime]);
  return html`
    <div className="flex items-center gap-2 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-100">
      <span className="animate-pulse w-2 h-2 bg-red-500 rounded-full"></span>
      <span className="text-xs font-black text-indigo-700 font-mono tracking-widest">${formatDuration(elapsed)}</span>
    </div>
  `;
};

// --- DASHBOARDS ---

const UserDashboard = ({ currentUser, tasks = [], setTasks, notify }) => {
  const [activeNote, setActiveNote] = useState({});
  const [editingNote, setEditingNote] = useState({ taskId: null, index: null, text: '' });
  const myTasks = useMemo(() => (tasks || []).filter(t => t.assigned_to === currentUser?.id), [tasks, currentUser]);

  const updateStatus = async (id, status, extra = {}) => {
    try {
      if (status === TaskStatus.COMPLETED) {
        const task = tasks.find(t => t.id === id);
        extra.efficiency = calculateEfficiency(task.estimated_time, task.accepted_at, new Date().toISOString());
      }
      const { data, error } = await supabase.from('tasks').update({ status, ...extra }).eq('id', id).select();
      if (!error && data) {
        setTasks(tasks.map(t => t.id === id ? data[0] : t));
        notify(status === TaskStatus.COMPLETED ? 'Obra finalizada' : 'Obra iniciada', 'success');
      }
    } catch (e) { notify('Error al actualizar', 'error'); }
  };

  const saveNote = async (id) => {
    const noteText = activeNote[id];
    if (!noteText?.trim()) return notify('La nota no puede estar vacía', 'error');
    const task = tasks.find(t => t.id === id);
    let currentNotes = [];
    try { currentNotes = JSON.parse(task.progress_notes || '[]'); } catch (e) { currentNotes = []; }
    const newNotes = [...currentNotes, { text: noteText, date: new Date().toISOString() }];
    const { data, error } = await supabase.from('tasks').update({ progress_notes: JSON.stringify(newNotes) }).eq('id', id).select();
    if (!error && data) {
      setTasks(tasks.map(t => t.id === id ? data[0] : t));
      setActiveNote({ ...activeNote, [id]: '' });
      notify('Nota guardada', 'success');
    }
  };

  const updateExistingNote = async (id) => {
    if (!editingNote.text?.trim()) return notify('Nota vacía', 'error');
    const task = tasks.find(t => t.id === id);
    let notes = [];
    try { notes = JSON.parse(task.progress_notes || '[]'); } catch (e) {}
    if (notes[editingNote.index]) {
      notes[editingNote.index].text = editingNote.text;
      const { data, error } = await supabase.from('tasks').update({ progress_notes: JSON.stringify(notes) }).eq('id', id).select();
      if (!error && data) {
        setTasks(tasks.map(t => t.id === id ? data[0] : t));
        setEditingNote({ taskId: null, index: null, text: '' });
        notify('Nota actualizada', 'success');
      }
    }
  };

  return html`
    <div className="max-w-xl mx-auto space-y-6 animate-fade-in">
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-black text-slate-800 italic uppercase">Mis Obras</h2>
        <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mt-1">OPERARIO: ${currentUser?.username}</p>
      </div>

      ${myTasks.length === 0 ? html`<div className="p-20 text-center bg-white rounded-[40px] border-2 border-dashed border-slate-200 text-slate-400 uppercase font-bold text-xs">Sin tareas asignadas</div>` : myTasks.map(t => {
        let noteHistory = []; try { noteHistory = JSON.parse(t.progress_notes || '[]'); } catch (e) { noteHistory = []; }
        const eff = t.efficiency || 100;
        const effColor = (eff >= 90) ? 'text-emerald-500' : (eff >= 60) ? 'text-amber-500' : 'text-red-500';
        const displayId = t.id ? (typeof t.id === 'string' ? t.id.split('-')[0] : 'TASK') : 'N/A';

        return html`
          <div key=${t.id} className="bg-white rounded-[32px] shadow-sm border border-slate-200 overflow-hidden mb-6">
            <div className="p-6 border-b border-slate-50 flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-black text-slate-800 text-lg uppercase">${t.title}</h3>
                  <span className="bg-slate-100 text-[9px] font-black text-slate-400 px-2 py-0.5 rounded-md">${t.estimated_time}HS</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-indigo-500 font-bold tracking-tighter uppercase">ID: ${displayId}</span>
                  ${t.status === TaskStatus.ACCEPTED && html`<${Timer} startTime=${t.accepted_at} />`}
                </div>
              </div>
              <span className=${`text-[9px] font-black px-3 py-1 rounded-full uppercase ${t.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-600' : t.status === 'ACCEPTED' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}>${t.status}</span>
            </div>
            <div className="p-6 bg-slate-50/50">
               <p className="text-sm text-slate-600 mb-6 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">${t.description}</p>
               
               <div className="space-y-6">
                 <div className="space-y-3">
                   <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Bitácora de Avance</h4>
                   <div className="space-y-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                     ${noteHistory.length === 0 ? html`<p className="text-[10px] text-slate-400 italic px-1 uppercase font-bold">Sin registros de nota</p>` : noteHistory.map((n, i) => {
                       if (!n) return null;
                       return html`
                       <div key=${i} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm relative group">
                         ${editingNote.taskId === t.id && editingNote.index === i ? html`
                           <div className="space-y-2">
                             <textarea value=${editingNote.text} onChange=${e => setEditingNote({...editingNote, text: e.target.value})} className="w-full text-sm p-3 bg-slate-50 rounded-lg border-0 outline-none ring-1 ring-indigo-200 min-h-[60px]" />
                             <div className="flex gap-2">
                               <button onClick=${() => updateExistingNote(t.id)} className="text-[9px] font-black bg-indigo-600 text-white px-3 py-1 rounded-md uppercase">Guardar</button>
                               <button onClick=${() => setEditingNote({taskId:null, index:null, text:''})} className="text-[9px] font-black bg-slate-200 text-slate-500 px-3 py-1 rounded-md uppercase">Cancelar</button>
                             </div>
                           </div>
                         ` : html`
                           <${React.Fragment}>
                             <p className="text-sm text-slate-700 leading-relaxed">${n.text}</p>
                             <div className="flex justify-between items-center mt-2 border-t border-slate-50 pt-1">
                               <p className="text-[9px] text-slate-400 font-bold italic">${new Date(n.date).toLocaleString()}</p>
                               ${t.status !== TaskStatus.COMPLETED && html`<button onClick=${() => setEditingNote({taskId: t.id, index: i, text: n.text})} className="opacity-0 group-hover:opacity-100 text-indigo-500 text-[9px] font-black uppercase transition-opacity">Editar Nota</button>`}
                             </div>
                           </${React.Fragment}>
                         `}
                       </div>
                     `})}
                   </div>
                 </div>

                 ${t.status === TaskStatus.PENDING ? html`
                   <button onClick=${() => updateStatus(t.id, TaskStatus.ACCEPTED, { accepted_at: new Date().toISOString() })} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-100 active:scale-95 uppercase text-xs">Iniciar Trabajo</button>
                 ` : t.status === TaskStatus.ACCEPTED ? html`
                   <div className="space-y-4">
                     <div className="space-y-3 p-4 bg-white rounded-2xl border border-slate-200 shadow-sm">
                       <textarea placeholder="¿Qué avance se hizo hoy?" value=${activeNote[t.id] || ''} onChange=${e => setActiveNote({...activeNote, [t.id]: e.target.value})} className="w-full p-4 bg-slate-50 border-0 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-100 min-h-[80px]" />
                       <button onClick=${() => saveNote(t.id)} className="w-full bg-slate-800 text-white py-3 rounded-xl text-[10px] font-black uppercase">Registrar Avance</button>
                     </div>
                     <button onClick=${() => updateStatus(t.id, TaskStatus.COMPLETED, { completed_at: new Date().toISOString() })} className="w-full border-2 border-emerald-600 text-emerald-600 py-3 rounded-2xl text-[10px] font-black uppercase hover:bg-emerald-50 transition-colors">Finalizar Obra</button>
                   </div>
                 ` : html`
                   <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-100 text-center">
                     <span className=${`block font-black text-2xl ${effColor}`}>${eff}% EFICIENCIA</span>
                     <p className="text-[9px] text-emerald-400 font-black uppercase tracking-widest mt-1">Obra Completada</p>
                   </div>
                 `}
               </div>
            </div>
          </div>
        `;
      })}
    </div>
  `;
};

const AdminDashboard = ({ users = [], setUsers, tasks = [], setTasks, settings, setSettings, notify, confirm }) => {
  const [view, setView] = useState('TASKS');
  const [modalUser, setModalUser] = useState({ show: false, mode: 'create', data: null });
  const [modalTask, setModalTask] = useState({ show: false, mode: 'create', data: null });
  const [modalNotes, setModalNotes] = useState({ show: false, task: null });
  
  const [userForm, setUserForm] = useState({ username: '', password: '', role: Role.USER });
  const [taskForm, setTaskForm] = useState({ title: '', description: '', assigned_to: '', estimated_time: 1 });
  const fileInputRef = useRef(null);

  const userStats = useMemo(() => {
    return users.reduce((acc, user) => {
      const completed = (tasks || []).filter(t => t.assigned_to === user.id && t.status === TaskStatus.COMPLETED);
      const avgEff = completed.length > 0 ? Math.round(completed.reduce((sum, t) => sum + (t.efficiency || 100), 0) / completed.length) : 100;
      acc[user.id] = { avgEff, completedCount: completed.length };
      return acc;
    }, {});
  }, [users, tasks]);

  const saveUser = async (e) => {
    e.preventDefault();
    try {
      if (modalUser.mode === 'edit') {
        const { data, error } = await supabase.from('users').update(userForm).eq('id', modalUser.data.id).select();
        if (error) throw error;
        setUsers(users.map(u => u.id === modalUser.data.id ? data[0] : u));
        notify('Usuario actualizado', 'success');
      } else {
        const { data, error } = await supabase.from('users').insert([userForm]).select();
        if (error) throw error;
        setUsers([...users, ...data]);
        notify('Usuario creado', 'success');
      }
      setModalUser({ show: false });
    } catch (err) { notify('Error: ' + err.message, 'error'); }
  };

  const saveTask = async (e) => {
    e.preventDefault();
    try {
      const { data, error } = await supabase.from('tasks').insert([{ ...taskForm, status: TaskStatus.PENDING, progress_notes: '[]', efficiency: 100 }]).select();
      if (error) throw error;
      setTasks([data[0], ...tasks]);
      notify('Obra registrada', 'success');
      setModalTask({ show: false });
    } catch (err) { notify('Error DB: ' + err.message, 'error'); }
  };

  const updateSetting = async (day, field, value) => {
    const newWorkingDays = { ...settings.working_days };
    newWorkingDays[day][field] = value;
    const { data, error } = await supabase.from('settings').update({ working_days: newWorkingDays }).eq('id', 1).select();
    if (!error) setSettings(data[0]);
  };

  const exportBackup = () => {
    const backup = { users, tasks, settings, export_date: new Date().toISOString(), version: VERSION };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_automatizacion_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    notify('Backup descargado', 'success');
  };

  const importBackup = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        confirm('¿Restaurar Backup?', 'ADVERTENCIA: Se borrarán los datos actuales y se cargarán los del backup.', async () => {
          await supabase.from('tasks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('users').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (data.users?.length) await supabase.from('users').insert(data.users);
          if (data.tasks?.length) await supabase.from('tasks').insert(data.tasks);
          if (data.settings) await supabase.from('settings').update(data.settings).eq('id', 1);
          window.location.reload();
        });
      } catch (err) { notify('Error al leer el archivo', 'error'); }
    };
    reader.readAsText(file);
  };

  return html`
    <div className="space-y-6 animate-fade-in">
      <div className="flex gap-2 p-1.5 bg-white border border-slate-200 rounded-2xl w-fit mx-auto sm:mx-0 sticky top-20 z-40 shadow-sm backdrop-blur-md">
        <button onClick=${() => setView('TASKS')} className=${`px-5 py-2 rounded-xl text-xs font-black uppercase transition-all ${view === 'TASKS' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>Obras</button>
        <button onClick=${() => setView('USERS')} className=${`px-5 py-2 rounded-xl text-xs font-black uppercase transition-all ${view === 'USERS' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>Personal</button>
        <button onClick=${() => setView('SETTINGS')} className=${`px-5 py-2 rounded-xl text-xs font-black uppercase transition-all ${view === 'SETTINGS' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>Ajustes</button>
      </div>

      ${view === 'TASKS' && html`
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-6 flex justify-between items-center border-b bg-slate-50/50">
            <h2 className="font-black text-slate-800 uppercase italic">Control General</h2>
            <button onClick=${() => { setTaskForm({title:'', description:'', assigned_to:'', estimated_time: 1}); setModalTask({show:true, mode:'create'}); }} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-indigo-100 active:scale-95 transition-all">+ Nueva Obra</button>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            ${tasks.map(t => {
              const eff = t.efficiency || 100;
              const effColor = (eff >= 90) ? 'text-emerald-500' : (eff >= 60) ? 'text-amber-500' : 'text-red-500';
              return html`
                <div key=${t.id} className="p-6 border rounded-[28px] hover:border-indigo-200 transition-all bg-slate-50/30 group flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <h3 className="font-black text-slate-800 text-sm uppercase">${t.title}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-indigo-500 font-bold">EST: ${t.estimated_time}HS</span>
                          ${t.status === TaskStatus.ACCEPTED && html`<${Timer} startTime=${t.accepted_at} />`}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick=${() => setModalNotes({show:true, task:t})} className="text-slate-300 hover:text-indigo-600 transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg></button>
                        <button onClick=${() => confirm('¿Borrar obra?', 'Esta acción no se puede deshacer.', async () => { await supabase.from('tasks').delete().eq('id', t.id); setTasks(tasks.filter(x => x.id !== t.id)); notify('Obra eliminada', 'success'); })} className="text-slate-300 hover:text-red-500 transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 line-clamp-2 h-8 italic">${t.description}</p>
                  </div>
                  <div className="flex justify-between items-end pt-4 border-t border-slate-100 mt-4">
                    <div className="flex flex-col"><span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Responsable</span><span className="text-[10px] font-black text-indigo-600 uppercase">${users.find(u => u.id === t.assigned_to)?.username || 'N/A'}</span></div>
                    <div className="text-right">
                       <span className=${`text-[9px] font-black px-2 py-1 rounded-lg uppercase ${t.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>${t.status}</span>
                       ${t.status === 'COMPLETED' && html`<div className=${`text-[10px] font-black ${effColor} mt-1`}>${eff}% EFI</div>`}
                    </div>
                  </div>
                </div>
              `;
            })}
          </div>
        </div>
      `}

      ${view === 'USERS' && html`
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-6 flex justify-between items-center border-b bg-slate-50/50">
            <h2 className="font-black text-slate-800 uppercase italic">Gestión de Personal</h2>
            <button onClick=${() => { setUserForm({username:'', password:'', role:Role.USER}); setModalUser({show:true, mode:'create'}); }} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-indigo-100 active:scale-95 transition-all">+ Alta Operario</button>
          </div>
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b"><tr><th className="p-6">Operario</th><th className="p-6">Eficiencia Promedio</th><th className="p-6 text-right">Acciones</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              ${users.map(u => {
                const stats = userStats[u.id] || { avgEff: 100, completedCount: 0 };
                const effColor = stats.avgEff >= 90 ? 'text-emerald-500' : stats.avgEff >= 60 ? 'text-amber-500' : 'text-red-500';
                return html`
                  <tr key=${u.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-6"><span className="font-black text-slate-700 block text-sm uppercase tracking-tight">${u.username}</span><span className="text-[9px] font-black text-slate-300 uppercase">${u.role}</span></td>
                    <td className="p-6"><span className=${`text-lg font-black ${effColor}`}>${stats.avgEff}%</span><span className="text-[9px] font-bold text-slate-400 ml-2 uppercase tracking-widest">(${stats.completedCount} Obras)</span></td>
                    <td className="p-6 text-right space-x-4">
                      <button onClick=${() => { setUserForm({username:u.username, password:u.password, role:u.role}); setModalUser({show:true, mode:'edit', data:u}); }} className="text-indigo-600 text-[10px] font-black uppercase hover:underline">Editar</button>
                      <button onClick=${() => confirm('¿Dar de baja?', 'El usuario perderá acceso inmediato.', async () => { await supabase.from('users').delete().eq('id', u.id); setUsers(users.filter(x => x.id !== u.id)); notify('Baja procesada', 'success'); })} className="text-red-400 text-[10px] font-black uppercase hover:underline">Baja</button>
                    </td>
                  </tr>
                `;
              })}
            </tbody>
          </table>
        </div>
      `}

      ${view === 'SETTINGS' && html`
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-6 border-b bg-slate-50/50"><h2 className="font-black text-slate-800 uppercase italic">Cronograma Laboral</h2></div>
            <div className="p-6 space-y-3">
              ${['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((name, i) => {
                const day = settings?.working_days?.[i] || { enabled: false, start: '08:00', end: '17:00' };
                return html`
                  <div key=${i} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked=${day.enabled} onChange=${e => updateSetting(i, 'enabled', e.target.checked)} className="w-5 h-5 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                      <span className="font-black text-xs uppercase text-slate-600 w-24">${name}</span>
                    </div>
                    <div className="flex gap-2 items-center">
                      <input type="time" disabled=${!day.enabled} value=${day.start} onChange=${e => updateSetting(i, 'start', e.target.value)} className="bg-white border border-slate-200 rounded-lg p-1.5 text-xs font-bold outline-none disabled:opacity-30" />
                      <span className="text-[10px] font-black text-slate-300">A</span>
                      <input type="time" disabled=${!day.enabled} value=${day.end} onChange=${e => updateSetting(i, 'end', e.target.value)} className="bg-white border border-slate-200 rounded-lg p-1.5 text-xs font-bold outline-none disabled:opacity-30" />
                    </div>
                  </div>
                `;
              })}
            </div>
          </div>
          
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm p-8 flex flex-col justify-center items-center text-center space-y-6">
            <div className="w-20 h-20 bg-indigo-50 rounded-[30px] flex items-center justify-center text-indigo-600">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800 uppercase italic">Resguardo de Información</h3>
              <p className="text-xs text-slate-400 mt-2 max-w-xs">Proteja los datos de la empresa descargando copias de seguridad periódicas.</p>
            </div>
            <div className="w-full space-y-3">
              <button onClick=${exportBackup} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-[10px] uppercase shadow-xl shadow-slate-200 active:scale-95 transition-all">Exportar Base de Datos (.JSON)</button>
              <button onClick=${() => fileInputRef.current.click()} className="w-full border-2 border-indigo-600 text-indigo-600 py-4 rounded-2xl font-black text-[10px] uppercase active:scale-95 transition-all">Importar desde Archivo</button>
              <input type="file" ref=${fileInputRef} onChange=${importBackup} className="hidden" accept=".json" />
            </div>
          </div>
        </div>
      `}

      <!-- MODALES ADMINISTRATIVOS -->
      ${modalUser.show && html`
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] w-full max-sm shadow-2xl p-10 animate-fade-in-up">
            <h2 className="text-2xl font-black mb-8 italic uppercase text-indigo-700">${modalUser.mode === 'create' ? 'Alta de Personal' : 'Modificar Perfil'}</h2>
            <form onSubmit=${saveUser} className="space-y-4">
              <input className="w-full bg-slate-50 p-4 rounded-2xl outline-none border border-slate-100 font-bold" placeholder="Usuario de Acceso" value=${userForm.username} onChange=${e => setUserForm({...userForm, username: e.target.value})} required />
              <input className="w-full bg-slate-50 p-4 rounded-2xl outline-none border border-slate-100 font-bold" type="password" placeholder="Contraseña de Acceso" value=${userForm.password} onChange=${e => setUserForm({...userForm, password: e.target.value})} required />
              <select className="w-full bg-slate-50 p-4 rounded-2xl outline-none border border-slate-100 font-bold text-xs" value=${userForm.role} onChange=${e => setUserForm({...userForm, role: e.target.value})}>
                <option value=${Role.USER}>ROL: OPERARIO DE PLANTA</option>
                <option value=${Role.ADMIN}>ROL: ADMINISTRADOR TOTAL</option>
              </select>
              <div className="flex gap-3 pt-6">
                <button type="button" onClick=${() => setModalUser({show:false})} className="flex-1 bg-slate-100 py-4 rounded-2xl font-black text-xs uppercase">Cancelar</button>
                <button type="submit" className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-black text-xs uppercase shadow-lg shadow-indigo-100">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      `}

      ${modalTask.show && html`
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] w-full max-w-md shadow-2xl p-10 animate-fade-in-up">
            <h2 className="text-2xl font-black mb-8 italic uppercase text-indigo-700">Lanzamiento de Obra</h2>
            <form onSubmit=${saveTask} className="space-y-5">
              <input className="w-full bg-slate-50 p-4 rounded-2xl border border-slate-100 font-bold" placeholder="Título de la Obra" value=${taskForm.title} onChange=${e => setTaskForm({...taskForm, title: e.target.value})} required />
              <div className="grid grid-cols-2 gap-4">
                <select className="w-full bg-slate-50 p-4 rounded-2xl border border-slate-100 font-bold text-xs" value=${taskForm.assigned_to} onChange=${e => setTaskForm({...taskForm, assigned_to: e.target.value})} required>
                  <option value="">ASIGNAR A...</option>
                  ${users.filter(u => u.role === Role.USER).map(u => html`<option key=${u.id} value=${u.id}>${u.username.toUpperCase()}</option>`)}
                </select>
                <input type="number" step="0.5" className="w-full bg-slate-50 p-4 rounded-2xl border border-slate-100 font-bold" placeholder="Horas Est." value=${taskForm.estimated_time} onChange=${e => setTaskForm({...taskForm, estimated_time: parseFloat(e.target.value)})} required />
              </div>
              <textarea className="w-full bg-slate-50 p-4 rounded-2xl border border-slate-100 min-h-[100px] text-sm leading-relaxed" placeholder="Describa el alcance detallado de la obra aquí..." value=${taskForm.description} onChange=${e => setTaskForm({...taskForm, description: e.target.value})} required />
              <div className="flex gap-3 pt-6">
                <button type="button" onClick=${() => setModalTask({show:false})} className="flex-1 bg-slate-100 py-4 rounded-2xl font-black text-xs uppercase">Cerrar</button>
                <button type="submit" className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-black text-xs uppercase shadow-lg shadow-indigo-100">Lanzar a Planta</button>
              </div>
            </form>
          </div>
        </div>
      `}

      ${modalNotes.show && html`
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] w-full max-w-xl shadow-2xl p-10 animate-fade-in-up">
            <h2 className="text-xl font-black mb-2 uppercase text-indigo-700">Historial de Obra: ${modalNotes.task.title}</h2>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-4 custom-scrollbar mt-6">
              ${(() => {
                let notes = []; try { notes = JSON.parse(modalNotes.task.progress_notes || '[]'); } catch(e) {}
                if (notes.length === 0) return html`<p className="text-center text-slate-400 py-10 font-bold uppercase text-xs italic">Sin registros de avance todavía.</p>`;
                return notes.map((n, i) => {
                  if (!n) return null;
                  return html`
                  <div key=${i} className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <p className="text-sm text-slate-700 leading-relaxed">${n.text}</p>
                    <div className="mt-2 text-[9px] font-black uppercase text-indigo-400 text-right font-mono">${new Date(n.date).toLocaleString()}</div>
                  </div>
                `});
              })()}
            </div>
            <button onClick=${() => setModalNotes({show:false, task:null})} className="w-full mt-8 bg-slate-900 text-white py-4 rounded-2xl font-black text-xs uppercase transition-all hover:bg-slate-800">Entendido</button>
          </div>
        </div>
      `}
    </div>
  `;
};

// --- APLICACIÓN PRINCIPAL ---

const App = () => {
  // PERSISTENCIA: Inicializar desde localStorage
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('automatizacion_session');
    return saved ? JSON.parse(saved) : null;
  });

  const [users, setUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [settings, setSettings] = useState(null);
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
      let { data: s } = await supabase.from('settings').select('*').maybeSingle();
      if (!s) {
        const initialDays = {"0":{"enabled":false,"start":"08:00","end":"17:00"},"1":{"enabled":true,"start":"08:00","end":"17:00"},"2":{"enabled":true,"start":"08:00","end":"17:00"},"3":{"enabled":true,"start":"08:00","end":"17:00"},"4":{"enabled":true,"start":"08:00","end":"17:00"},"5":{"enabled":true,"start":"08:00","end":"17:00"},"6":{"enabled":false,"start":"08:00","end":"17:00"}};
        const { data: created } = await supabase.from('settings').insert([{ id: 1, working_days: initialDays }]).select();
        s = created ? created[0] : null;
      }
      setUsers(u || []); setTasks(t || []); setSettings(s);
    } catch (err) { console.error("Fetch Error:", err); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) return html`<div className="h-screen flex flex-col items-center justify-center bg-indigo-900 text-white"><div className="w-12 h-12 border-4 border-indigo-400 border-t-white rounded-full animate-spin mb-4"></div><h1 className="text-xl font-black uppercase italic tracking-widest animate-pulse">Cargando Planta...</h1></div>`;
  
  if (!currentUser) return html`
    <div className="h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="bg-white p-10 rounded-[40px] shadow-2xl w-full max-w-sm border border-slate-200 animate-fade-in-up">
        <h1 className="text-3xl font-black text-center text-indigo-700 italic uppercase tracking-tighter mb-8">Automatizacion</h1>
        <form onSubmit=${(e) => {
          e.preventDefault();
          const user = users.find(x => x.username === e.target.u.value && x.password === e.target.p.value);
          if (user) {
            // Guardar sesión persistente
            localStorage.setItem('automatizacion_session', JSON.stringify(user));
            setCurrentUser(user);
          } else {
            notify('Credenciales Incorrectas', 'error');
          }
        }} className="space-y-4">
          <input name="u" className="w-full p-4 border rounded-2xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500 font-bold transition-all" placeholder="ID de Usuario" required autoComplete="username" />
          <input name="p" type="password" className="w-full p-4 border rounded-2xl bg-slate-50 outline-none focus:ring-2 focus:ring-indigo-500 font-bold transition-all" placeholder="Contraseña" required autoComplete="current-password" />
          <button type="submit" className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase shadow-lg active:scale-95 transition-all hover:bg-indigo-700">Ingresar al Sistema</button>
        </form>
      </div>
    </div>
  `;

  return html`
    <div className="min-h-screen flex flex-col bg-slate-50">
      <nav className="bg-white/90 border-b border-slate-200 px-6 py-5 sticky top-0 z-50 shadow-sm backdrop-blur-md flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black italic text-xl shadow-lg shadow-indigo-100">A</div>
          <h1 className="text-xl font-black text-indigo-700 italic uppercase tracking-tighter">Automatizacion</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-black uppercase text-slate-700 leading-none">${currentUser.username}</p>
            <p className="text-[9px] text-indigo-500 font-black uppercase tracking-widest mt-1">${currentUser.role}</p>
          </div>
          <button onClick=${() => confirm('¿Cerrar Sesión?', 'Desea salir del terminal actual.', () => {
            localStorage.removeItem('automatizacion_session');
            setCurrentUser(null);
          })} className="p-2.5 bg-slate-50 rounded-xl text-slate-400 hover:text-red-500 active:scale-90 transition-all border border-slate-100"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m4 4H7"/></svg></button>
        </div>
      </nav>
      <main className="flex-grow max-w-5xl mx-auto w-full p-6 pb-24">
        ${currentUser.role === Role.ADMIN ? html`<${AdminDashboard} users=${users} setUsers=${setUsers} tasks=${tasks} setTasks=${setTasks} settings=${settings} setSettings=${setSettings} notify=${notify} confirm=${confirm} />` : html`<${UserDashboard} currentUser=${currentUser} tasks=${tasks} setTasks=${setTasks} notify=${notify} />`}
      </main>
      <footer className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-slate-100 flex justify-between items-center px-8 z-[60]">
        <div className="text-[9px] text-slate-300 font-black uppercase tracking-widest">CAF Cloud Industrial System</div>
        <div className="text-[10px] text-slate-500 font-black bg-slate-100 px-3 py-1 rounded-full border border-slate-200 uppercase tracking-tight">${VERSION} • Production</div>
      </footer>
      ${toast && html`<${Toast} message=${toast.message} type=${toast.type} onClose=${() => setToast(null)} />`}
      <${ConfirmModal} show=${confirmation.show} title=${confirmation.title} message=${confirmation.message} onConfirm=${confirmation.onConfirm} onCancel=${() => setConfirmation(c => ({...c, show: false}))} />
    </div>
    <style>${`
      @keyframes fade-in-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      .animate-fade-in-up { animation: fade-in-up 0.3s ease-out; }
      @keyframes opacity { from { opacity: 0; } to { opacity: 1; } }
      .animate-fade-in { animation: opacity 0.4s ease-in; }
      @keyframes bounce-short { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
      .animate-bounce-short { animation: bounce-short 0.5s ease-in-out infinite; }
      .custom-scrollbar::-webkit-scrollbar { width: 4px; }
      .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
      .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    `}</style>
  `;
};

export default App;