/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Building2, Camera, ShieldAlert, Award, FileSpreadsheet, Layers, School, 
  MapPin, Heart, Compass, Grid, Users, LayoutDashboard, Clock, RefreshCw,
  Lock, Unlock, Shield, Delete, KeyRound
} from 'lucide-react';

import { Teacher, AttendanceRecord, SchoolConfig } from './types';
import { DEFAULTS_TEACHERS } from './data/defaultTeachers';
import { getSeedRecords } from './data/seedData';
import KioskTab from './components/KioskTab';
import AdminTab from './components/AdminTab';

export default function App() {
  const [currentTab, setCurrentTab] = useState<'KIOSK' | 'ADMIN'>('KIOSK');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);
  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string | null>(null);

  // numerical passcode keyboard validation handler
  const handlePinKeyPress = (val: string) => {
    setPinError(null);
    if (pinInput.length < 6) {
      const newPin = pinInput + val;
      setPinInput(newPin);
      
      const targetPin = config?.adminPin || '1234';
      if (newPin === targetPin) {
        setIsAdminAuthenticated(true);
        setPinInput('');
      } else if (newPin.length >= targetPin.length) {
        setPinError('PIN keamanan tidak valid!');
        setTimeout(() => {
          setPinInput('');
        }, 600);
      }
    }
  };

  const handlePinBackspace = () => {
    setPinInput(prev => prev.slice(0, -1));
    setPinError(null);
  };

  const handlePinClear = () => {
    setPinInput('');
    setPinError(null);
  };
  
  // Teachers state with local storage
  const [teachers, setTeachers] = useState<Teacher[]>(() => {
    const saved = localStorage.getItem('taliabu_teachers');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return DEFAULTS_TEACHERS;
  });

  // School config
  const [config, setConfig] = useState<SchoolConfig>(() => {
    const saved = localStorage.getItem('taliabu_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.isPinEnabled === undefined) {
          parsed.isPinEnabled = false;
        }
        if (!parsed.adminPin) {
          parsed.adminPin = "1234";
        }
        return parsed;
      } catch (e) { console.error(e); }
    }
    return {
      schoolName: "SMK Negeri 5 Pulau Taliabu",
      clockInStart: "06:30",
      clockInLate: "07:30",
      clockOutTime: "14:15",
      adminPin: "1234",
      isPinEnabled: false
    };
  });

  // Attendance Records
  const [records, setRecords] = useState<AttendanceRecord[]>(() => {
    const saved = localStorage.getItem('taliabu_attendance');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return getSeedRecords(DEFAULTS_TEACHERS);
  });

  // Save states to local storage on changes
  useEffect(() => {
    localStorage.setItem('taliabu_teachers', JSON.stringify(teachers));
  }, [teachers]);

  useEffect(() => {
    localStorage.setItem('taliabu_attendance', JSON.stringify(records));
  }, [records]);

  useEffect(() => {
    localStorage.setItem('taliabu_config', JSON.stringify(config));
  }, [config]);

  // Statistics Calculation
  const [dashboardStats, setDashboardStats] = useState({
    totalTeachers: 0,
    presentToday: 0,
    lateToday: 0,
    sickOrExcused: 0,
    attendanceRate: 0
  });

  // Re-calculate stats on records/teachers update
  useEffect(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayRecords = records.filter(r => r.date === todayStr);
    
    const present = todayRecords.filter(r => r.clockIn !== null).length;
    const late = todayRecords.filter(r => r.statusIn === 'Terlambat').length;
    const excused = todayRecords.filter(r => r.statusIn === 'Sakit' || r.statusIn === 'Izin').length;
    const total = teachers.length;
    const rate = total > 0 ? ((present) / total) * 100 : 0;

    setDashboardStats({
      totalTeachers: total,
      presentToday: present,
      lateToday: late,
      sickOrExcused: excused,
      attendanceRate: rate
    });
  }, [records, teachers]);

  // Add a new teacher
  const handleAddTeacher = (newT: Omit<Teacher, 'id' | 'registeredAt'>) => {
    const t: Teacher = {
      ...newT,
      id: `teach-${Date.now()}`,
      registeredAt: new Date().toISOString()
    };
    setTeachers(prev => [t, ...prev]);
  };

  // Delete a teacher
  const handleDeleteTeacher = (id: string) => {
    setTeachers(prev => prev.filter(t => t.id !== id));
    // optionally clean up records as well
    setRecords(prev => prev.filter(r => r.teacherId !== id));
  };

  // Update School Configuration
  const handleUpdateConfig = (newCfg: SchoolConfig) => {
    setConfig(newCfg);
  };

  // Add Manual attendance record from admin drawer
  const handleAddManualRecord = (newRec: Omit<AttendanceRecord, 'id'>) => {
    const rec: AttendanceRecord = {
      ...newRec,
      id: `manual-rec-${Date.now()}`
    };
    
    // Check if there is already a record for this teacher on this exact date
    setRecords(prev => {
      const idx = prev.findIndex(item => item.teacherId === newRec.teacherId && item.date === newRec.date);
      if (idx >= 0) {
        // overwrite/merge
        const updated = [...prev];
        updated[idx] = { ...prev[idx], ...rec, id: prev[idx].id };
        return updated;
      }
      return [rec, ...prev];
    });
  };

  // Delete attendance record
  const handleDeleteRecord = (id: string) => {
    setRecords(prev => prev.filter(r => r.id !== id));
  };

  // Core biometric attendance scanner clock register
  const handlePunchAttendance = (
    teacherId: string, 
    type: 'MASUK' | 'PULANG', 
    timeStr: string, 
    dateStr: string,
    verificationPhoto?: string,
    livenessVerified?: boolean
  ) => {
    const teacher = teachers.find(t => t.id === teacherId);
    if (!teacher) return;

    setRecords(prev => {
      const existingIdx = prev.findIndex(r => r.teacherId === teacherId && r.date === dateStr);
      const updated = [...prev];

      if (existingIdx >= 0) {
        // Record exists, let's update current keys
        const current = { ...updated[existingIdx] };
        if (type === 'MASUK') {
          current.clockIn = timeStr;
          const timeVal = parseFloat(timeStr.replace(/:/g, '.').substring(0, 5));
          const lateVal = parseFloat(config.clockInLate.replace(/:/g, '.'));
          current.statusIn = timeVal > lateVal ? 'Terlambat' : 'Hadir';
          if (verificationPhoto) current.verificationPhoto = verificationPhoto;
          if (livenessVerified !== undefined) current.livenessVerified = livenessVerified;
          current.notes = livenessVerified 
            ? "Presensi Biometrik Lolos Anti-Kecurangan 3D" 
            : "Presensi Biometrik Wajah";
        } else {
          current.clockOut = timeStr;
          const timeVal = parseFloat(timeStr.replace(/:/g, '.').substring(0, 5));
          const outVal = parseFloat(config.clockOutTime.replace(/:/g, '.'));
          current.statusOut = timeVal < outVal ? 'Pulang Cepat' : 'Pulang';
          if (verificationPhoto) current.verificationPhoto = verificationPhoto;
          if (livenessVerified !== undefined) current.livenessVerified = livenessVerified;
          current.notes = livenessVerified 
            ? "Presensi Biometrik Lolos Anti-Kecurangan 3D" 
            : "Presensi Biometrik Wajah";
        }
        updated[existingIdx] = current;
      } else {
        // Create new record
        let statusIn: 'Hadir' | 'Terlambat' | null = null;
        let statusOut: 'Pulang' | 'Pulang Cepat' | null = null;

        if (type === 'MASUK') {
          const timeVal = parseFloat(timeStr.replace(/:/g, '.').substring(0, 5));
          const lateVal = parseFloat(config.clockInLate.replace(/:/g, '.'));
          statusIn = timeVal > lateVal ? 'Terlambat' : 'Hadir';
        } else {
          const timeVal = parseFloat(timeStr.replace(/:/g, '.').substring(0, 5));
          const outVal = parseFloat(config.clockOutTime.replace(/:/g, '.'));
          statusOut = timeVal < outVal ? 'Pulang Cepat' : 'Pulang';
        }

        updated.unshift({
          id: `punch-${Date.now()}`,
          teacherId,
          teacherName: teacher.name,
          nip: teacher.nip,
          subject: teacher.subject,
          date: dateStr,
          clockIn: type === 'MASUK' ? timeStr : null,
          clockOut: type === 'PULANG' ? timeStr : null,
          statusIn,
          statusOut,
          notes: livenessVerified 
            ? "Presensi Biometrik Lolos Anti-Kecurangan 3D" 
            : "Presensi Biometrik Wajah",
          verificationPhoto,
          livenessVerified
        });
      }

      return updated;
    });
  };

  // Reset persistent database to factory settings
  const handleResetToDefault = () => {
    if (confirm("Apakah Anda yakin ingin menyetel ulang database kembali ke data contoh bawaan? Semua presensi baru akan terhapus.")) {
      localStorage.removeItem('taliabu_teachers');
      localStorage.removeItem('taliabu_attendance');
      localStorage.removeItem('taliabu_config');
      setTeachers(DEFAULTS_TEACHERS);
      setRecords(getSeedRecords(DEFAULTS_TEACHERS));
      setConfig({
        schoolName: "SMK Negeri 5 Pulau Taliabu",
        clockInStart: "06:30",
        clockInLate: "07:30",
        clockOutTime: "14:15",
        adminPin: "1234",
        isPinEnabled: false
      });
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col justify-between" id="app-root-shell">
      
      {/* PROFESSIONAL MASTHEAD SCHOOL HEADER */}
      <header className="h-20 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between shrink-0 shadow-sm" id="school-masthead">
        <div className="max-w-7xl mx-auto w-full flex flex-col sm:flex-row justify-between items-center gap-4">
          
          {/* LOGO & DESKRIPSI SEKOLAH */}
          <div className="flex items-center gap-4 animate-fadeIn" id="school-identity">
            <div className="w-12 h-12 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-sm shrink-0">
              <School className="w-7 h-7 stroke-[1.5]" />
            </div>
            
            <div className="text-center sm:text-left">
              <h1 className="text-lg font-bold font-display tracking-tight text-slate-900 leading-tight">
                SMK NEGERI 5 PULAU TALIABU
              </h1>
              <p className="text-[10px] text-slate-500 font-medium tracking-widest uppercase flex flex-col sm:flex-row sm:items-center gap-1">
                <span>Smart Presence System v2.0 • Pengembang:</span>
                <span className="text-indigo-650 font-bold bg-indigo-50 border border-indigo-100 px-1 py-0.2 rounded text-[9px]">arfin arfa, ST</span>
              </p>
            </div>
          </div>

          {/* VIEW SWITCHER TABS - KIOSK VS ADMIN */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200" id="view-mode-tabs">
            <button
              onClick={() => {
                if (config.isPinEnabled) {
                  setIsAdminAuthenticated(false); // Auto lock on moving away
                  setPinInput('');
                  setPinError(null);
                }
                setCurrentTab('KIOSK');
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                currentTab === 'KIOSK'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              id="tab-kiosk-mode"
            >
              <Camera className="w-4 h-4 text-indigo-600" />
              <span>KIOSK PINDAI</span>
            </button>

            <button
              onClick={() => setCurrentTab('ADMIN')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                currentTab === 'ADMIN'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              id="tab-admin-dash"
            >
              <LayoutDashboard className="w-4 h-4 text-indigo-600" />
              <span>DASHBOARD</span>
              {config.isPinEnabled && (
                isAdminAuthenticated ? (
                  <Unlock className="w-3.5 h-3.5 text-emerald-500 animate-pulse shrink-0 ml-0.5" />
                ) : (
                  <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0 ml-0.5" />
                )
              )}
            </button>
          </div>

        </div>
      </header>

      {/* ADMIN STATS BENTO GRID (Visible on Admin dashboard for instant overview) */}
      {currentTab === 'ADMIN' && (isAdminAuthenticated || !config.isPinEnabled) && (
        <section className="max-w-7xl mx-auto w-full px-4 sm:px-8 pt-8 animate-fadeIn" id="dashboard-analytics-hud">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
            
            {/* CARD 1: TOTAL DEWAN GURU */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-slate-100 text-slate-600 rounded-lg shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Dewan Guru</p>
                <p className="text-xl sm:text-2xl font-bold font-mono text-slate-900 leading-tight mt-0.5">{dashboardStats.totalTeachers}</p>
              </div>
            </div>

            {/* CARD 2: HADIR HARI INI */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg shrink-0">
                <Heart className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Hadir</p>
                <p className="text-xl sm:text-2xl font-bold font-mono text-slate-900 leading-tight mt-0.5">
                  {dashboardStats.presentToday}
                </p>
              </div>
            </div>

            {/* CARD 3: TERLAMBAT HARI INI */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-lg shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Terlambat</p>
                <p className="text-xl sm:text-2xl font-bold font-mono text-slate-900 leading-tight mt-0.5">
                  {dashboardStats.lateToday}
                </p>
              </div>
            </div>

            {/* CARD 4: PERSENTASE PRESENSI */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
                <RefreshCw className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Rasio Absen</p>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <p className="text-xl sm:text-2xl font-bold font-mono text-indigo-600 leading-tight">
                    {dashboardStats.attendanceRate.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>

          </div>
        </section>
      )}

      {/* MAIN VIEWPORT STAGE */}
      <main className="max-w-7xl mx-auto w-full px-4 sm:px-8 py-8 flex-1" id="main-content-viewport">
        {currentTab === 'KIOSK' ? (
          <div className="animate-fadeIn" id="kiosk-tab-pane">
            <KioskTab 
              teachers={teachers}
              records={records}
              config={config}
              onPunchAttendance={handlePunchAttendance}
            />
          </div>
        ) : config.isPinEnabled && !isAdminAuthenticated ? (
          /* --- BEAUTIFUL SECURE PIN PAD INTERACTIVE LOCK SCREEN --- */
          <div className="max-w-[440px] mx-auto my-6 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 text-center shadow-xl animate-fadeIn" id="admin-lockpad-screen">
            <div className="w-16 h-16 bg-amber-50 border border-amber-200 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-inner">
              <Lock className="w-8 h-8 animate-bounce" />
            </div>

            <h3 className="text-slate-900 font-extrabold text-lg tracking-tight uppercase">Dashboard Terkunci</h3>
            <p className="text-slate-400 text-xs mt-1 bg-slate-50 border border-slate-100 py-1.5 px-3 rounded-xl inline-block">
              PIN Keamanan Aktif - masukkan kode keamanan untuk melanjutkan
            </p>

            {/* Indicator dots displaying PIN input state length */}
            <div className="flex justify-center gap-3.5 my-7" id="pin-indicator-dots">
              {Array.from({ length: Math.max(4, config.adminPin?.length || 4) }).map((_, idx) => (
                <div 
                  key={idx} 
                  className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                    pinInput.length > idx 
                      ? 'bg-indigo-600 border-indigo-600 scale-110 shadow-md shadow-indigo-600/20' 
                      : 'bg-transparent border-slate-300'
                  }`}
                />
              ))}
            </div>

            {pinError && (
              <div className="p-2.5 bg-rose-50 border border-rose-150 rounded-xl text-rose-650 text-xs font-bold font-sans tracking-wide mb-5 animate-pulse" id="pin-error-alert">
                ⚠ {pinError}
              </div>
            )}

            {/* NUMERICAL PIN KEYPAD PANEL */}
            <div className="grid grid-cols-3 gap-3.5 max-w-[280px] mx-auto mb-6" id="pin-numeric-keypad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handlePinKeyPress(num)}
                  className="w-16 h-16 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200/80 active:scale-95 text-slate-800 text-lg font-bold font-mono tracking-widest flex items-center justify-center cursor-pointer transition-all hover:border-slate-300"
                >
                  {num}
                </button>
              ))}

              <button
                type="button"
                onClick={handlePinClear}
                className="w-16 h-16 rounded-2xl bg-slate-50 hover:bg-red-50 hover:text-red-600 border border-slate-200/80 hover:border-red-200 text-xs font-bold uppercase tracking-wider flex items-center justify-center cursor-pointer transition-all active:scale-95 text-slate-500 font-sans"
              >
                Reset
              </button>

              <button
                type="button"
                onClick={() => handlePinKeyPress('0')}
                className="w-16 h-16 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200/80 text-lg font-bold font-mono flex items-center justify-center cursor-pointer transition-all active:scale-95"
              >
                0
              </button>

              <button
                type="button"
                onClick={handlePinBackspace}
                className="w-16 h-16 rounded-2xl bg-slate-50 hover:bg-amber-50 hover:text-amber-600 border border-slate-200/80 hover:border-amber-200 text-amber-500 flex items-center justify-center cursor-pointer transition-all active:scale-95"
              >
                <Delete className="w-5 h-5 font-bold" />
              </button>
            </div>

            {/* Helpful default PIN suggestion for first timers */}
            <div className="mt-8 pt-5 border-t border-slate-100 flex flex-col items-center gap-2">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
                <KeyRound className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
                <span>PIN Kunci Utama Bawaan: <strong className="text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded font-black font-mono">1234</strong></span>
              </div>
              <p className="text-[10px] text-slate-400 leading-normal max-w-[290px] mx-auto italic">
                (PIN pengaman ini dapat dinonaktifkan atau diganti di tab 'KONFIGURASI' setelah berhasil masuk)
              </p>
            </div>
          </div>
        ) : (
          <div className="animate-fadeIn" id="admin-tab-pane">
            <AdminTab 
              teachers={teachers}
              records={records}
              config={config}
              onAddTeacher={handleAddTeacher}
              onDeleteTeacher={handleDeleteTeacher}
              onUpdateConfig={handleUpdateConfig}
              onAddManualRecord={handleAddManualRecord}
              onDeleteRecord={handleDeleteRecord}
            />
          </div>
        )}
      </main>

      {/* SYSTEM STATUS FOOTER */}
      <footer className="h-10 bg-slate-800 px-4 sm:px-8 flex items-center justify-between text-[10px] text-slate-400 shrink-0 uppercase tracking-widest font-semibold" id="app-footer">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>DATABASE CONNECTED</span>
          </div>
          <div className="flex items-center gap-1.5 hidden sm:flex">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>FACE RECOGNITION ACTIVE</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleResetToDefault}
            className="text-amber-400 hover:text-amber-500 uppercase font-mono tracking-widest bg-transparent border-none cursor-pointer text-[10px]"
          >
            SETEL ULANG DATA
          </button>
          <span>•</span>
          <div className="flex items-center gap-1 text-[10px] text-slate-300">
            <span>© 2026 SMK NEGERI 5 PULAU TALIABU • PENGEMBANG: <strong className="text-indigo-400 bg-slate-900 border border-slate-700 px-1.5 py-0.5 rounded font-display font-black text-[9.5px]">arfin arfa, ST</strong></span>
          </div>
        </div>
      </footer>

    </div>
  );
}
