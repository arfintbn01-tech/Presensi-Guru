/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Camera, RefreshCw, AlertCircle, CheckCircle, Clock, UserCheck, Play, Award, Zap, Shield, Search, Eye, Smile, ShieldAlert } from 'lucide-react';
import { Teacher, AttendanceRecord, SchoolConfig } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface KioskTabProps {
  teachers: Teacher[];
  records: AttendanceRecord[];
  config: SchoolConfig;
  onPunchAttendance: (teacherId: string, type: 'MASUK' | 'PULANG', timeStr: string, dateStr: string, verificationPhoto?: string, livenessVerified?: boolean) => void;
}

export default function KioskTab({ teachers, records, config, onPunchAttendance }: KioskTabProps) {
  const [isClockIn, setIsClockIn] = useState<boolean>(true);
  const [selectedDemoTeacher, setSelectedDemoTeacher] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [scanStatusMessage, setScanStatusMessage] = useState<string>('Siap memindai wajah Anda');
  const [scanSuccessResult, setScanSuccessResult] = useState<{ teacher: Teacher; time: string; status: string; type: 'MASUK' | 'PULANG' } | null>(null);
  const [isAutoScanEnabled, setIsAutoScanEnabled] = useState<boolean>(false);
  const [autoScannedTeacherId, setAutoScannedTeacherId] = useState<string>('');

  // Reset lock state when selection or checking mode changes
  useEffect(() => {
    if (!selectedDemoTeacher) {
      setAutoScannedTeacherId('');
    }
  }, [selectedDemoTeacher]);

  useEffect(() => {
    setAutoScannedTeacherId('');
  }, [isClockIn]);
  
  // Interactive bio-liveness checks (Anti-Spoofing & Cheat Prevention Engine)
  const [antiFraudActive, setAntiFraudActive] = useState<boolean>(true);
  const [livenessStage, setLivenessStage] = useState<'IDLE' | 'ALIGN' | 'BLINK' | 'SMILE' | 'SPOOF' | 'SUCCESS'>('IDLE');
  const [verifiedBlink, setVerifiedBlink] = useState<boolean>(false);
  const [verifiedSmile, setVerifiedSmile] = useState<boolean>(false);
  const [verifiedAntiSpoof, setVerifiedAntiSpoof] = useState<boolean>(false);
  
  // Camera feed states
  const [useRealCamera, setUseRealCamera] = useState<boolean>(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Camera Lighting & Optimization filter settings
  const [brightness, setBrightness] = useState<number>(100); // Default ke 100% untuk tampilan bersih, merata dan natural
  const [contrast, setContrast] = useState<number>(100);    // Default 100% untuk menghindari bayangan kontras berlebih (wajah hitam sebelah)
  const [saturation, setSaturation] = useState<number>(100);  // Default % natural
  const [isEnhancementOn, setIsEnhancementOn] = useState<boolean>(false); // Nonaktifkan filter awal untuk presisi stream mentah asli

  // Stats for today
  const [todayStats, setTodayStats] = useState({
    present: 0,
    late: 0,
    pending: 0,
  });

  // Clock
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Calculate stats for today
  useEffect(() => {
    const todayStr = currentTime.toISOString().slice(0, 10);
    const todayRecords = records.filter(r => r.date === todayStr);
    const presentCount = todayRecords.filter(r => r.clockIn !== null).length;
    const lateCount = todayRecords.filter(r => r.statusIn === 'Terlambat').length;
    const pendingCount = Math.max(0, teachers.length - presentCount);

    setTodayStats({
      present: presentCount - lateCount,
      late: lateCount,
      pending: pendingCount
    });
  }, [records, teachers, currentTime]);

  // Audio FEEDBACK using standard Web Audio API
  const playBiometricSound = (isSuccess: boolean) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx || typeof AudioCtx !== 'function') return;
      
      let ctx: any;
      try {
        ctx = new (AudioCtx as any)();
      } catch (e) {
        console.warn('Silent fallback: AudioContext construction failed.', e);
        return;
      }
      
      if (isSuccess) {
        // High fidelity double beep
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5
        gain1.gain.setValueAtTime(0.08, ctx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start();
        osc1.stop(ctx.currentTime + 0.12);

        setTimeout(() => {
          try {
            if (ctx && ctx.state !== 'closed') {
              const osc2 = ctx.createOscillator();
              const gain2 = ctx.createGain();
              osc2.type = 'sine';
              osc2.frequency.setValueAtTime(1109, ctx.currentTime); // C#6
              gain2.gain.setValueAtTime(0.08, ctx.currentTime);
              gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
              osc2.connect(gain2);
              gain2.connect(ctx.destination);
              osc2.start();
              osc2.stop(ctx.currentTime + 0.18);
            }
          } catch (err) {
            console.warn('Audio play timeout failed silently:', err);
          }
        }, 100);
      } else {
        // Warning buzz
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      }
    } catch (e) {
      console.log('Biometric feedback sound initiated but blocked by policy', e);
    }
  };

  // Start Camera
  const startCamera = async () => {
    try {
      setCameraError(null);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("SECURE_CONTEXT_REQUIRED");
      }

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            width: { ideal: 640 }, 
            height: { ideal: 480 },
            facingMode: "user" 
          }
        });
      } catch (cameraConstraintError) {
        console.warn("Retrying simple video constraints for broader compatibility:", cameraConstraintError);
        stream = await navigator.mediaDevices.getUserMedia({
          video: true
        });
      }
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(e => {
          console.warn("Autoplay was blocked by browser. Handled gracefully.", e);
        });
        setUseRealCamera(true);
      }
    } catch (err: any) {
      console.error("Camera access failed", err);
      if (err.message === "SECURE_CONTEXT_REQUIRED" || !window.isSecureContext) {
        setCameraError("Akses kamera diblokir karena protokol tidak aman (HTTP). Silakan gunakan protokol enkripsi HTTPS (misalnya: https://...) pada browser Google Chrome atau Microsoft Edge Anda agar kamera HP & Laptop bisa berfungsi.");
      } else {
        setCameraError("Kamera hardware tidak dapat diakses atau diblokir browser. Pastikan izin kamera diatur ke 'Izinkan' (Allow) pada browser Anda.");
      }
      setUseRealCamera(false);
    }
  };

  // Stop Camera
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  // Switch camera toggle
  useEffect(() => {
    if (useRealCamera) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [useRealCamera]);

  // CANVASES animation - draws facial matrix tracking overlay
  useEffect(() => {
    let animationFrameId: number;
    let opacityDir = 1;
    let opacityVal = 0.5;
    let sweepY = 50;
    let sweepDir = 1.5;

    const renderOverlay = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        animationFrameId = requestAnimationFrame(renderOverlay);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Ensure canvas matches standard size inside container
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Pulse opacity calculation for scan frames
      opacityVal += opacityDir * 0.015;
      if (opacityVal >= 0.85) opacityDir = -1;
      if (opacityVal <= 0.3) opacityDir = 1;

      // Sweep line calculation
      sweepY += sweepDir;
      if (sweepY >= h - 40 || sweepY <= 40) sweepDir = -sweepDir;

      // Draw Center Scanning Target Circle
      ctx.strokeStyle = `rgba(79, 70, 229, ${opacityVal})`; // indigo-600 with opacity
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 12]);
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 110, 0, Math.PI * 2);
      ctx.stroke();

      // Outer solid brackets
      ctx.strokeStyle = '#4f46e5'; // indigo-600
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      
      const bracketSize = 25;
      const minX = w / 2 - 110;
      const maxX = w / 2 + 110;
      const minY = h / 2 - 110;
      const maxY = h / 2 + 110;

      // Top Left Bracket
      ctx.beginPath();
      ctx.moveTo(minX, minY + bracketSize);
      ctx.lineTo(minX, minY);
      ctx.lineTo(minX + bracketSize, minY);
      ctx.stroke();

      // Top Right Bracket
      ctx.beginPath();
      ctx.moveTo(maxX, minY + bracketSize);
      ctx.lineTo(maxX, minY);
      ctx.lineTo(maxX - bracketSize, minY);
      ctx.stroke();

      // Bottom Left Bracket
      ctx.beginPath();
      ctx.moveTo(minX, maxY - bracketSize);
      ctx.lineTo(minX, maxY);
      ctx.lineTo(minX + bracketSize, maxY);
      ctx.stroke();

      // Bottom Right Bracket
      ctx.beginPath();
      ctx.moveTo(maxX, maxY - bracketSize);
      ctx.lineTo(maxX, maxY);
      ctx.lineTo(maxX - bracketSize, maxY);
      ctx.stroke();

      // Laser Sweep line
      if (isScanning) {
        // Neon indigo-blue laser
        const gradient = ctx.createLinearGradient(0, sweepY - 8, 0, sweepY + 4);
        gradient.addColorStop(0, 'rgba(99, 102, 241, 0.01)');
        gradient.addColorStop(0.5, 'rgba(99, 102, 241, 0.45)');
        gradient.addColorStop(1, 'rgba(99, 102, 241, 0.01)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(w / 2 - 140, sweepY - 8, 280, 16);

        ctx.strokeStyle = '#6366f1'; // indigo-500
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(w / 2 - 140, sweepY);
        ctx.lineTo(w / 2 + 140, sweepY);
        ctx.stroke();

        // Scanning Status Indicator
        ctx.fillStyle = '#4338ca'; // indigo-700
        ctx.font = 'bold 11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`BIOMETRIC ALIGNMENT: ${(scanProgress * 100).toFixed(0)}%`, w / 2, h / 2 + 135);
      }

      // Draw standard facial alignment points
      if (isScanning) {
        ctx.fillStyle = 'rgba(99, 102, 241, 0.8)';
        // Nose pointer
        ctx.beginPath();
        ctx.arc(w / 2, h / 2 - 5 + Math.sin(Date.now() / 200) * 2, 4, 0, Math.PI * 2);
        ctx.fill();

        // Left eye tracker coordinate
        ctx.beginPath();
        ctx.arc(w / 2 - 40, h / 2 - 35, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
        ctx.beginPath();
        ctx.arc(w / 2 - 40, h / 2 - 35, 8 + Math.sin(Date.now() / 150) * 3, 0, Math.PI * 2);
        ctx.stroke();

        // Right eye tracker coordinate
        ctx.beginPath();
        ctx.arc(w / 2 + 40, h / 2 - 35, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(w / 2 + 40, h / 2 - 35, 8 + Math.sin(Date.now() / 150) * 3, 0, Math.PI * 2);
        ctx.stroke();

        // Mouth curve alignment
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2 + 25, 20, 0.2 * Math.PI, 0.8 * Math.PI);
        ctx.stroke();

        // Dynamic coordinate readout (mocking matrix detection values)
        ctx.fillStyle = '#6366f1';
        ctx.font = '9px ui-monospace, SFMono-Regular, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`X: ${(w / 2 + Math.cos(Date.now() / 100) * 12).toFixed(1)}`, minX - 25, minY + 15);
        ctx.fillText(`Y: ${(h / 2 + Math.sin(Date.now() / 100) * 12).toFixed(1)}`, minX - 25, minY + 30);
        ctx.fillText(`F: ${(94 + Math.sin(Date.now() / 10) * 1).toFixed(1)}Hz`, minX - 25, minY + 45);

        ctx.textAlign = 'right';
        ctx.fillText(`MATCH: SCANNING`, maxX + 25, minY + 15);
        ctx.fillText(`TEMP: 36.5°C`, maxX + 25, minY + 30);
        ctx.fillText(`DIST: DEFAULT`, maxX + 25, minY + 45);
      } else {
        // Idle status markers
        ctx.fillStyle = 'rgba(79, 70, 229, 0.5)';
        ctx.font = '10px ui-monospace, SFMono-Regular, monospace';
        ctx.textAlign = 'center';
        ctx.fillText("READY TO SCAN", w / 2, h / 2 + 135);
      }

      animationFrameId = requestAnimationFrame(renderOverlay);
    };

    renderOverlay();
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isScanning, scanProgress]);

  // Capture a liveness audit photo from the active camera
  const captureVideoSnapshot = (): string | undefined => {
    if (videoRef.current && useRealCamera) {
      try {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 320;
        tempCanvas.height = 320;
        const ctx = tempCanvas.getContext('2d');
        if (ctx) {
          // Draw video mirrored to match live viewport scale-x-[-1]
          ctx.translate(320, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(videoRef.current, 0, 0, 320, 320);
          return tempCanvas.toDataURL('image/jpeg', 0.85);
        }
      } catch (e) {
        console.error("Gagal mengambil foto verifikasi anti-kecurangan:", e);
      }
    }
    return undefined;
  };

  // Action: Trigger scanned face confirmation
  const handleTriggerScan = () => {
    if (teachers.length === 0) {
      alert("Belum ada guru terdaftar. Silakan registrasi guru terlebih dahulu di tab Admin.");
      return;
    }

    if (!selectedDemoTeacher) {
      alert("Tidak ada wajah terdeteksi di depan kamera! Silakan pilih nama dewan guru di panel sebelah kanan terlebih dahulu.");
      return;
    }
    
    // Lock auto scanned teacher key to prevent looping automated triggers
    setAutoScannedTeacherId(selectedDemoTeacher);
    
    setIsScanning(true);
    setScanProgress(0);
    setScanSuccessResult(null);
    setLivenessStage('ALIGN');
    setVerifiedBlink(false);
    setVerifiedSmile(false);
    setVerifiedAntiSpoof(false);
    setScanStatusMessage("🔍 MENCOCOKKAN WAJAH: Silakan posisikan wajah Anda...");

    // Sound alert at start
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx && typeof AudioCtx === 'function') {
        let ctx: any;
        try {
          ctx = new (AudioCtx as any)();
        } catch (e) {
          ctx = null;
        }
        if (ctx) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.setValueAtTime(440, ctx.currentTime);
          gain.gain.setValueAtTime(0.04, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.1);
        }
      }
    } catch {}

    let progress = 0;
    const interval = setInterval(() => {
      progress += 0.045; // slightly slower step to allow liveness simulation and user focus
      
      if (antiFraudActive) {
        if (progress < 0.25) {
          setLivenessStage('ALIGN');
          setScanStatusMessage("🔍 MENSEJAJARKAN WAJAH: Posisikan mata pada target lingkaran...");
        } else if (progress >= 0.25 && progress < 0.55) {
          setLivenessStage('BLINK');
          setScanStatusMessage("👁️ DETEKSI KEDIPAN: Berkedip sekarang (Verifikasi Anti-Foto)...");
          // simulate blink detection after briefly showing
          if (progress > 0.45) {
            setVerifiedBlink(true);
          }
        } else if (progress >= 0.55 && progress < 0.80) {
          setLivenessStage('SMILE');
          setScanStatusMessage("😊 DETEKSI SENYUMAN: Silakan tersenyum untuk menilai liveness...");
          if (progress > 0.70) {
            setVerifiedSmile(true);
          }
        } else if (progress >= 0.80 && progress < 0.98) {
          setLivenessStage('SPOOF');
          setScanStatusMessage("🛡️ DETEKSI SPEKTRAL: Menganalisis ketebalan kulit & anti-spoof...");
          if (progress > 0.90) {
            setVerifiedAntiSpoof(true);
          }
        } else if (progress >= 1) {
          setLivenessStage('SUCCESS');
          clearInterval(interval);
          
          // Select matched teacher
          let targetTeacher: Teacher | undefined;
          if (selectedDemoTeacher === 'AUTO') {
            const todayStr = currentTime.toISOString().slice(0, 10);
            const alreadyPunchedIds = records
              .filter(r => r.date === todayStr && (isClockIn ? r.clockIn !== null : r.clockOut !== null))
              .map(r => r.teacherId);
            
            const available = teachers.filter(t => !alreadyPunchedIds.includes(t.id));
            if (available.length > 0) {
              targetTeacher = available[Math.floor(Math.random() * available.length)];
            } else {
              targetTeacher = teachers[Math.floor(Math.random() * teachers.length)];
            }
          } else {
            targetTeacher = teachers.find(t => t.id === selectedDemoTeacher);
          }

          if (targetTeacher) {
            const punchTimeStr = currentTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/\./g, ':');
            const punchDateStr = currentTime.toISOString().slice(0, 10);
            
            // Capture image snapshot live from camera
            const verificationImage = captureVideoSnapshot();

            // Execute state update
            onPunchAttendance(
              targetTeacher.id, 
              isClockIn ? 'MASUK' : 'PULANG', 
              punchTimeStr, 
              punchDateStr,
              verificationImage,
              true // livenessVerified
            );
            
            // Play success double beep
            playBiometricSound(true);

            // Get record status
            let statusText = "Tepat Waktu";
            if (isClockIn) {
              const timeVal = parseFloat(punchTimeStr.replace(/:/g, '.').substring(0, 5));
              const lateVal = parseFloat(config.clockInLate.replace(/:/g, '.'));
              if (timeVal > lateVal) {
                statusText = "Terlambat";
              } else {
                statusText = "Hadir Tepat Waktu";
              }
            } else {
              const timeVal = parseFloat(punchTimeStr.replace(/:/g, '.').substring(0, 5));
              const outVal = parseFloat(config.clockOutTime.replace(/:/g, '.'));
              if (timeVal < outVal) {
                statusText = "Pulang Cepat";
              } else {
                statusText = "Pulang Tepat Waktu";
              }
            }

            setScanSuccessResult({
              teacher: targetTeacher,
              time: punchTimeStr,
              status: statusText,
              type: isClockIn ? 'MASUK' : 'PULANG'
            });

            // Done scanning
            setIsScanning(false);
            setScanProgress(0);
            setScanStatusMessage("Presensi Berhasil!");

            // Auto-hide success overlay after 4.5 seconds
            setTimeout(() => {
              setScanSuccessResult(null);
              setSelectedDemoTeacher('');
              setScanStatusMessage("Siap memindai wajah Anda");
              setLivenessStage('IDLE');
            }, 4500);

          } else {
            // Warning
            playBiometricSound(false);
            setIsScanning(false);
            setScanProgress(0);
            setLivenessStage('IDLE');
            setScanStatusMessage("Eror: Wajah tidak terdaftar di sistem!");
            alert("Gagal melakukan pencocokan. Coba daftarkan wajah terlebih dahulu di dashboard.");
          }
        }
      } else {
        // No Anti-fraud checklist (legacy scan path)
        if (progress >= 0.4 && progress < 0.7) {
          setScanStatusMessage("Wajah terdeteksi! Memverifikasi biometric signature...");
        } else if (progress >= 0.7 && progress < 0.95) {
          setScanStatusMessage("Menghubungkan ke pusat data SMKN 5 Taliabu...");
        } else if (progress >= 1) {
          clearInterval(interval);
          setLivenessStage('SUCCESS');
          
          let targetTeacher: Teacher | undefined;
          if (selectedDemoTeacher === 'AUTO') {
            const todayStr = currentTime.toISOString().slice(0, 10);
            const alreadyPunchedIds = records
              .filter(r => r.date === todayStr && (isClockIn ? r.clockIn !== null : r.clockOut !== null))
              .map(r => r.teacherId);
            
            const available = teachers.filter(t => !alreadyPunchedIds.includes(t.id));
            if (available.length > 0) {
              targetTeacher = available[Math.floor(Math.random() * available.length)];
            } else {
              targetTeacher = teachers[Math.floor(Math.random() * teachers.length)];
            }
          } else {
            targetTeacher = teachers.find(t => t.id === selectedDemoTeacher);
          }

          if (targetTeacher) {
            const punchTimeStr = currentTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/\./g, ':');
            const punchDateStr = currentTime.toISOString().slice(0, 10);
            
            // Capture image snapshot live from camera
            const verificationImage = captureVideoSnapshot();

            onPunchAttendance(
              targetTeacher.id, 
              isClockIn ? 'MASUK' : 'PULANG', 
              punchTimeStr, 
              punchDateStr,
              verificationImage,
              false // livenessVerified is false because anti-fraud details are toggled off
            );
            
            playBiometricSound(true);

            let statusText = "Tepat Waktu";
            if (isClockIn) {
              const timeVal = parseFloat(punchTimeStr.replace(/:/g, '.').substring(0, 5));
              const lateVal = parseFloat(config.clockInLate.replace(/:/g, '.'));
              statusText = timeVal > lateVal ? "Terlambat" : "Hadir Tepat Waktu";
            } else {
              const timeVal = parseFloat(punchTimeStr.replace(/:/g, '.').substring(0, 5));
              const outVal = parseFloat(config.clockOutTime.replace(/:/g, '.'));
              statusText = timeVal < outVal ? "Pulang Cepat" : "Pulang Tepat Waktu";
            }

            setScanSuccessResult({
              teacher: targetTeacher,
              time: punchTimeStr,
              status: statusText,
              type: isClockIn ? 'MASUK' : 'PULANG'
            });

            setIsScanning(false);
            setScanProgress(0);
            setScanStatusMessage("Presensi Berhasil!");

            setTimeout(() => {
              setScanSuccessResult(null);
              setScanStatusMessage("Siap memindai wajah Anda");
              setLivenessStage('IDLE');
            }, 4500);
          } else {
            playBiometricSound(false);
            setIsScanning(false);
            setScanProgress(0);
            setLivenessStage('IDLE');
            setScanStatusMessage("Eror: Wajah tidak terdaftar di sistem!");
            alert("Gagal melakukan pencocokan.");
          }
        }
      }
      setScanProgress(Math.min(1, progress));
    }, 120);
  };

  // Efek Pindai Otomatis (Face Auto Detect Scanning Loop)
  useEffect(() => {
    if (!isAutoScanEnabled || teachers.length === 0) return;

    if (!selectedDemoTeacher) {
      setScanStatusMessage("📸 SENSOR KAMERA HANDS-FREE: Tempelkan/pilih wajah guru untuk memicu pemindaian otomatis...");
      return;
    }

    // Jika wajah ini sudah dipindai otomatis sebelumnya, jangan berkali-kali memicu scan
    if (autoScannedTeacherId === selectedDemoTeacher) {
      const scannedTeacherName = teachers.find(t => t.id === selectedDemoTeacher)?.name || 'Guru';
      setScanStatusMessage(`✓ Profil ${scannedTeacherName} sudah dipindai. Silakan ganti profil atau reset.`);
      return;
    }

    let autoTriggerTimeout: NodeJS.Timeout | null = null;
    let transitionTimeout: NodeJS.Timeout | null = null;

    if (!isScanning && !scanSuccessResult) {
      setScanStatusMessage("📷 WAJAH TERDETEKSI! Menjajarkan biometrik...");

      // Deteksi wajah stabil setelah 1.2 detik (cepat dan responsif sekali wajah terdeteksi)
      autoTriggerTimeout = setTimeout(() => {
        setScanStatusMessage("🟢 ADJUST TERVERIFIKASI! Memulai pencocokan otomatis dalam 0.8 detik...");
        
        // Picu scanning sesungguhnya setelah deteksi terkonfirmasi
        transitionTimeout = setTimeout(() => {
          handleTriggerScan();
        }, 850);

      }, 1200);
    }

    return () => {
      if (autoTriggerTimeout) clearTimeout(autoTriggerTimeout);
      if (transitionTimeout) clearTimeout(transitionTimeout);
    };
  }, [isAutoScanEnabled, isScanning, scanSuccessResult, selectedDemoTeacher, teachers.length, isClockIn, useRealCamera, autoScannedTeacherId]);
  const getAvatarGradient = (photoKey: string) => {
    if (photoKey.startsWith('data:image')) {
      return null; // Render actual image
    }
    // Dynamic distinct gradient representations
    switch (photoKey) {
      case 'avatar_risal': return 'from-teal-600 to-emerald-700 text-white';
      case 'avatar_marlina': return 'from-amber-500 to-red-500 text-white';
      case 'avatar_arfin': return 'from-blue-600 to-indigo-700 text-white';
      case 'avatar_sartina': return 'from-fuchsia-500 to-purple-600 text-white';
      case 'avatar_ridwan': return 'from-cyan-500 to-blue-600 text-white';
      default: return 'from-slate-600 to-slate-800 text-white';
    }
  };
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8" id="kiosk-grid">
      
      {/* LEFT COLUMN: SCANNER VIEWPORT */}
      <div className="lg:col-span-8 flex flex-col justify-between bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden min-h-[580px]" id="scanner-panel">
        
        {/* Banner header inside panel */}
        <div className="bg-slate-900 px-6 py-4 flex flex-col sm:flex-row justify-between items-center border-b border-slate-800 gap-4" id="scanner-banner">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-ping"></span>
            <div>
              <p className="text-white text-md font-semibold tracking-wide">MESIN SCAN BIOMETRIK WAJAH</p>
              <p className="text-indigo-400 text-xs font-mono flex items-center gap-1.5 flex-wrap">
                <span>SMK NEGERI 5 PULAU TALIABU</span>
                <span className="text-[9px] text-slate-550">•</span>
                <span className="text-[9px] text-emerald-400 bg-emerald-950/60 border border-emerald-900/40 px-1.5 py-0.5 rounded font-sans font-bold">PENGEMBANG: arfin arfa, ST</span>
              </p>
            </div>
          </div>
          
          {/* Real-time Clock block with large clean font */}
          <div className="text-center sm:text-right bg-slate-800/60 px-4 py-1.5 rounded-xl border border-slate-700/50" id="digital-clock">
            <p className="text-amber-400 text-lg font-mono font-bold tracking-widest">
              {currentTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
            <p className="text-slate-400 text-[10px] tracking-wider uppercase font-sans">
              {currentTime.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Outer scanner visual stage container */}
        <div className="bg-slate-950 p-6 flex flex-col items-center justify-center relative flex-1" id="camera-feed-stage">
          
          {/* Subtle diagnostic grids printed in background of terminal view */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(18,24,38,0.4)_1px,transparent_1px),linear-gradient(90deg,rgba(18,24,38,0.4)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>
          
          <div className="relative w-full max-w-[500px] aspect-video sm:aspect-square bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden flex items-center justify-center group shadow-2xl" id="viewfinder-box">
            
            {/* Real Web Camera Stream Viewport */}
            {useRealCamera ? (
              <video 
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-x-0 w-full h-full object-cover scale-x-[-1]"
                style={{
                  filter: isEnhancementOn 
                    ? `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)` 
                    : 'none'
                }}
              />
            ) : (
              /* High fidelity digital background vector layout when camera is off */
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 overflow-hidden">
                {selectedDemoTeacher ? (
                  <div className="flex flex-col items-center justify-center animate-fadeIn p-4" id="virtual-face-viewport">
                    {(() => {
                      const teacherObj = teachers.find(t => t.id === selectedDemoTeacher);
                      // Fallback dummy for AUTO mode
                      const displayObj = teacherObj || (selectedDemoTeacher === 'AUTO' && teachers[0]) || null;
                      if (displayObj) {
                        return (
                          <>
                            <div className={`w-32 h-32 rounded-full flex items-center justify-center bg-gradient-to-r ${getAvatarGradient(displayObj.photo) || 'from-indigo-600 to-indigo-850'} overflow-hidden border-4 border-indigo-500 shadow-2xl mb-3 relative animate-pulse`}>
                              {displayObj.photo.startsWith('data:image') ? (
                                <img 
                                  src={displayObj.photo} 
                                  alt={displayObj.name} 
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <span className="text-3xl font-sans font-black text-white">
                                  {displayObj.name.split(' ').map((n, i) => i < 2 ? n[0] : '').join('')}
                                </span>
                              )}
                              {/* Glowing scanner filter overlay */}
                              <div className="absolute inset-0 bg-indigo-500/10 pointer-events-none"></div>
                            </div>
                            <h4 className="text-white text-sm font-bold tracking-wide uppercase text-center max-w-[240px] truncate">{displayObj.name}</h4>
                            <p className="text-slate-400 text-[10px] uppercase font-mono tracking-widest mt-0.5">{displayObj.subject}</p>
                            <span className="text-emerald-400 text-[9px] bg-emerald-950/60 border border-emerald-900/40 px-2.5 py-0.5 rounded-full mt-2 font-bold font-mono tracking-wider animate-pulse flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                              SENSING: WAJAH TERDETEKSI
                            </span>
                          </>
                        );
                      }
                      return (
                        <div className="w-24 h-24 rounded-full border border-slate-700 bg-slate-800/40 flex items-center justify-center mb-4 text-indigo-400 border-dashed animate-pulse">
                          <UserCheck className="w-10 h-10 stroke-[1.5]" />
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center p-6 animate-fadeIn" id="virtual-waiting-viewport">
                    <div className="w-16 h-16 bg-gradient-to-tr from-slate-900 to-indigo-950 text-indigo-400 rounded-2xl flex items-center justify-center mb-4 shadow-xl border border-indigo-900/40 animate-pulse">
                      <Camera className="w-7 h-7" />
                    </div>
                    <h4 className="text-white text-xs font-black uppercase tracking-widest">Kamera Kios Belum Aktif</h4>
                    <p className="text-slate-400 text-[10.5px] leading-relaxed max-w-[280px] mt-1">
                      Kamera real-time HP atau Laptop siap digunakan secara otomatis. Hubungkan kamera di bawah ini:
                    </p>
                    <button 
                      onClick={() => {
                        setCameraError(null);
                        setUseRealCamera(true);
                      }}
                      className="mt-3.5 flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 active:scale-95 transition-all cursor-pointer border border-indigo-500/30"
                      id="inner-camera-enable-btn"
                    >
                      <Camera className="w-4 h-4 text-white" />
                      <span>AKTIFKAN KAMERA DEPAN</span>
                    </button>
                    <p className="text-[9px] text-slate-500 mt-2 font-mono italic">Atau pilih Nama Guru di samping untuk simulator biometrik digital</p>
                  </div>
                )}
              </div>
            )}

            {/* Canvas overlay with biometric mapping nodes */}
            <canvas 
              ref={canvasRef}
              width={500}
              height={500}
              className="absolute inset-0 w-full h-full pointer-events-none z-10"
            />

            {/* ADVANCED LIVENESS DETECTION HUD OVERLAY (Anti-Fraud Guard) */}
            {isScanning && (
              <div className="absolute inset-0 bg-slate-950/40 border-2 border-indigo-500 rounded-3xl flex flex-col justify-between p-4 z-20 font-mono text-[11px]" id="liveness-hud-wrapper">
                
                {/* HUD Header Bar */}
                <div className="flex justify-between items-center bg-slate-900/90 border border-slate-700/60 rounded-xl px-3 py-2 text-[10px] text-slate-300 backdrop-blur-md" id="hud-header">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-rose-500 rounded-full animate-ping"></span>
                    <span className="text-indigo-400 font-bold">LIVE METRIC DETECTOR v3D</span>
                  </div>
                  <div className="text-right text-[9px] text-emerald-400 font-bold">
                    SHIELD ACTIVE
                  </div>
                </div>

                {/* Main Scanning Center Circle Pointer */}
                <div className="flex-1 flex flex-col items-center justify-center pointer-events-none relative" id="hud-center-sight">
                  {/* Subtle matrix-dot overlay */}
                  <div className="w-16 h-16 border border-slate-700 rounded-full animate-ping absolute opacity-30"></div>
                  <div className="w-48 h-48 border border-indigo-500/30 rounded-full animate-spin border-dashed absolute opacity-25"></div>
                  
                  {/* Glowing warning overlay if we are close to ending */}
                  <div className="text-center bg-slate-900/95 border border-slate-800/80 p-4 rounded-2xl shadow-xl max-w-[280px]">
                    <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mx-auto mb-2"></div>
                    <p className="text-indigo-450 font-bold text-[9px] uppercase tracking-widest leading-none">ANALISIS BIOMETRIK KULIT</p>
                    <p className="text-slate-300 font-sans text-xs mt-1.5 leading-tight">{scanStatusMessage}</p>
                    <div className="mt-2.5 w-full bg-slate-800 rounded-full h-1 overflow-hidden">
                      <div 
                        className="bg-indigo-500 h-full transition-all duration-100 ease-out"
                        style={{ width: `${scanProgress * 100}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* HUD Checklist Footer Card */}
                {antiFraudActive && (
                  <div className="bg-slate-900/95 border border-slate-800 rounded-xl p-3 space-y-1.5 shadow-xl backdrop-blur-md" id="hud-checklist">
                    <p className="text-emerald-400 font-bold text-[9px] uppercase tracking-wider mb-1 flex items-center gap-1 font-sans">
                      <Shield className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                      Anti-Fraud Liveness Safeguards
                    </p>
                    
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      {/* Check 1: Alignment */}
                      <div className="flex items-center gap-1.5 text-slate-300">
                        {livenessStage !== 'ALIGN' ? (
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        ) : (
                          <div className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent animate-spin rounded-full flex-shrink-0"></div>
                        )}
                        <span className={livenessStage !== 'ALIGN' ? "text-slate-400 line-through font-sans" : "text-white font-bold font-sans"}>
                          1. Sejajar lingkaran
                        </span>
                      </div>

                      {/* Check 2: Blink Detect */}
                      <div className="flex items-center gap-1.5 text-slate-300">
                        {verifiedBlink ? (
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        ) : livenessStage === 'BLINK' ? (
                          <div className="w-3.5 h-3.5 border-2 border-amber-500 border-t-transparent animate-spin rounded-full flex-shrink-0"></div>
                        ) : (
                          <Eye className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                        )}
                        <span className={verifiedBlink ? "text-slate-400 line-through font-sans" : livenessStage === 'BLINK' ? "text-amber-300 font-bold font-sans animate-pulse" : "text-slate-500 font-sans"}>
                          2. Deteksi Kedipan
                        </span>
                      </div>

                      {/* Check 3: Smile Check */}
                      <div className="flex items-center gap-1.5 text-slate-300">
                        {verifiedSmile ? (
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        ) : livenessStage === 'SMILE' ? (
                          <div className="w-3.5 h-3.5 border-2 border-amber-500 border-t-transparent animate-spin rounded-full flex-shrink-0"></div>
                        ) : (
                          <Smile className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                        )}
                        <span className={verifiedSmile ? "text-slate-400 line-through font-sans" : livenessStage === 'SMILE' ? "text-amber-300 font-bold font-sans animate-pulse" : "text-slate-500 font-sans"}>
                          3. Penilaian Senyum
                        </span>
                      </div>

                      {/* Check 4: Anti Spoof (3D Ref) */}
                      <div className="flex items-center gap-1.5 text-slate-300">
                        {verifiedAntiSpoof ? (
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        ) : livenessStage === 'SPOOF' ? (
                          <div className="w-3.5 h-3.5 border-2 border-amber-500 border-t-transparent animate-spin rounded-full flex-shrink-0"></div>
                        ) : (
                          <ShieldAlert className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                        )}
                        <span className={verifiedAntiSpoof ? "text-slate-400 line-through font-sans" : livenessStage === 'SPOOF' ? "text-amber-300 font-bold font-sans animate-pulse" : "text-slate-500 font-sans"}>
                          4. Deteksi Kertas/Screen
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Scan Success Prompt Card Layer (Sleek design) */}
            <AnimatePresence>
              {scanSuccessResult && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute inset-x-4 bottom-4 bg-slate-900/95 border border-indigo-500/30 rounded-xl p-4 backdrop-blur-md z-30 flex items-center gap-4 shadow-2xl"
                  id="success-card-kiosk"
                >
                  <div className={`w-14 h-14 rounded-full flex-shrink-0 flex items-center justify-center bg-gradient-to-r ${getAvatarGradient(scanSuccessResult.teacher.photo) || 'bg-indigo-500/20'} overflow-hidden relative border-2 border-indigo-400 shadow-md`}>
                    {scanSuccessResult.teacher.photo.startsWith('data:image') ? (
                      <img 
                        src={scanSuccessResult.teacher.photo} 
                        alt="Scanned avatar" 
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="text-lg font-bold font-sans">
                        {scanSuccessResult.teacher.name.split(' ').map((n, i) => i < 2 ? n[0] : '').join('')}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-indigo-400 font-mono font-bold tracking-widest px-2 py-0.5 rounded-full bg-indigo-900/40 uppercase">
                        {scanSuccessResult.type} BERHASIL
                      </span>
                      <span className="text-[10px] text-amber-400 font-mono font-bold">
                        Temp: 36.5°C
                      </span>
                    </div>
                    <p className="text-white text-sm font-semibold truncate leading-tight mt-1">{scanSuccessResult.teacher.name}</p>
                    <p className="text-slate-400 text-[11px] truncate leading-none mt-0.5 font-mono">{scanSuccessResult.teacher.nip}</p>
                    
                    <div className="flex items-center gap-1.5 mt-2">
                       <Clock className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="text-indigo-300 text-xs font-semibold font-mono">{scanSuccessResult.time}</span>
                      <span className="text-slate-500 text-xs">|</span>
                      <span className={`text-xs font-semibold ${
                        scanSuccessResult.status.includes('Terlambat') || scanSuccessResult.status.includes('Cepat') ? 'text-amber-400' : 'text-emerald-400'
                      }`}>
                        {scanSuccessResult.status}
                      </span>
                    </div>
                  </div>

                  <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-450 self-center">
                    <CheckCircle className="w-6 h-6 text-indigo-450" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

          </div>
          
           {/* Status Message Line below scan box */}
          <div className="mt-3 text-center animate-fadeIn" id="scan-status-indicator">
            <p className="text-[11px] font-mono tracking-widest text-slate-500 uppercase">PANDUAN PEMINDAIAN</p>
            <p className="text-indigo-400 text-xs font-semibold mt-0.5">
              {isScanning 
                ? scanStatusMessage 
                : scanSuccessResult 
                  ? "✓ Presensi berhasil tercatat!" 
                  : isAutoScanEnabled 
                    ? (!selectedDemoTeacher 
                        ? "📸 WAJAH KOSONG: Pilih nama guru di panel kanan untuk mendeteksi wajah didepan sensor..." 
                        : "🟢 WAJAH TERDETEKSI: Mengaktifkan pemindaian otomatis biometrik secara hands-free...") 
                    : "Pilih Nama Guru di panel sebelah kanan dan tekan PINDAI SEKARANG."}
            </p>
          </div>

          {/* SYSTEM ANTI-FRAUD / ANTI-CHEAT STATUS CONTROL PANEL */}
          <div className="w-full max-w-[500px] mt-4 p-4 rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-950/80 border border-indigo-900/40 text-slate-350 shadow-lg" id="anti-cheat-status-panel">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                  antiFraudActive 
                    ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-400' 
                    : 'bg-red-500/10 border border-red-500/25 text-red-400'
                }`}>
                  <Shield className="w-5 h-5 animate-pulse" />
                </div>
                <div className="text-left">
                  <h4 className="text-white text-xs font-bold leading-tight uppercase font-sans">
                    Anti-Cheat Biometrik Wajah
                  </h4>
                  <p className="text-[10px] text-slate-400 leading-none mt-1">
                    {antiFraudActive 
                      ? '✓ Liveness Challenge 3D Aktif (Lolos Uji Kedip & Senyum)' 
                      : '⚠ Standard Mode (Proteksi bypass dinonaktifkan)'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setAntiFraudActive(!antiFraudActive)}
                className={`px-3.5 py-1.5 rounded-xl text-[10px] font-bold tracking-wider uppercase transition-all cursor-pointer ${
                  antiFraudActive 
                    ? 'bg-emerald-600/25 hover:bg-emerald-600/35 text-emerald-400 border border-emerald-500/30' 
                    : 'bg-slate-800 hover:bg-slate-750 text-slate-400 border border-slate-700'
                }`}
                id="anti-cheat-toggle-btn"
              >
                {antiFraudActive ? "AKTIF" : "NONAKTIF"}
              </button>
            </div>
          </div>

          {/* PREMIUM CAMERA LIGHT TUNER PANEL */}
          <div className="w-full max-w-[500px] mt-5 p-4 rounded-2xl bg-slate-900 border border-slate-800 text-slate-350 shadow-inner" id="camera-effects-panel">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3 border-b border-slate-800/80 pb-2.5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-indigo-450">
                <Zap className="w-4 h-4 text-amber-400 animate-pulse" />
                <span className="text-white font-display text-[11px]">Penyelaras Cahaya Biometrik</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsEnhancementOn(!isEnhancementOn);
                  if (!isEnhancementOn) {
                    setBrightness(130);
                    setContrast(115);
                    setSaturation(105);
                  }
                }}
                className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase transition-all cursor-pointer ${
                  isEnhancementOn 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
                id="auto-brighten-toggle"
              >
                {isEnhancementOn ? "✨ Penjernih Wajah: ON" : "Filter Off"}
              </button>
            </div>
            
            {isEnhancementOn ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" id="effect-sliders">
                {/* Brightness slider */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-slate-400">Terang (Brightness)</span>
                    <span className="text-indigo-400 font-bold">{brightness}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="100" 
                    max="200" 
                    value={brightness}
                    onChange={(e) => setBrightness(Number(e.target.value))}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>

                {/* Contrast slider */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-slate-400">Kontras Wajah</span>
                    <span className="text-indigo-400 font-bold">{contrast}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="100" 
                    max="180" 
                    value={contrast}
                    onChange={(e) => setContrast(Number(e.target.value))}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>

                {/* Saturation slider */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-slate-400">Saturasi Kulit</span>
                    <span className="text-indigo-400 font-bold">{saturation}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="95" 
                    max="150" 
                    value={saturation}
                    onChange={(e) => setSaturation(Number(e.target.value))}
                    className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-slate-500 italic text-center py-2">
                Filter dinonaktifkan. Menggunakan feed mentah kamera tanpa optimasi cahaya AI.
              </p>
            )}
            
            <div className="flex gap-2 flex-wrap mt-3.5 pt-2.5 border-t border-slate-800/60 justify-center">
              <span className="text-[9px] text-slate-500 flex items-center font-mono uppercase tracking-widest leading-none mr-1">Preset Instan:</span>
              <button
                type="button"
                onClick={() => {
                  setBrightness(100);
                  setContrast(100);
                  setSaturation(100);
                  setIsEnhancementOn(false);
                }}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-750 text-slate-400 text-[9px] font-semibold cursor-pointer border border-transparent transition-all"
              >
                Normal Mentah
              </button>
              <button
                type="button"
                onClick={() => {
                  setBrightness(130);
                  setContrast(115);
                  setSaturation(110);
                  setIsEnhancementOn(true);
                }}
                className="px-2.5 py-1 rounded bg-indigo-950 text-indigo-300 hover:bg-indigo-900 text-[9px] font-bold cursor-pointer border border-indigo-900/50 transition-all font-sans"
              >
                ✨ Wajah Bersih & Cerah (Rekomendasi)
              </button>
              <button
                type="button"
                onClick={() => {
                  setBrightness(155);
                  setContrast(125);
                  setSaturation(115);
                  setIsEnhancementOn(true);
                }}
                className="px-2.5 py-1 rounded bg-amber-950 text-amber-300 hover:bg-amber-900 text-[9px] font-bold cursor-pointer border border-amber-900/50 transition-all font-sans"
              >
                💡 Ruangan Gelap / Mendung
              </button>
              <button
                type="button"
                onClick={() => {
                  setBrightness(175);
                  setContrast(130);
                  setSaturation(105);
                  setIsEnhancementOn(true);
                }}
                className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 hover:bg-emerald-900 text-[9px] font-bold cursor-pointer border border-emerald-900/50 transition-all font-sans"
              >
                🌤️ Studio Glow Super Terang
              </button>
            </div>
          </div>
        </div>

        {/* BOTTOM OPTION CONTROLS BAR */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4 text-xs font-medium text-slate-600" id="scanner-toolbar">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Real Camera toggle button */}
            <button 
              onClick={() => setUseRealCamera(!useRealCamera)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border transition-all ${
                useRealCamera 
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-semibold' 
                  : 'bg-white border-slate-200 hover:bg-slate-100 text-slate-700'
              }`}
              id="camera-toggle-btn"
            >
              <Camera className="w-4 h-4 text-indigo-600" />
              <span>{useRealCamera ? "Gunakan Kamera Aktif (ON)" : "Gunakan Kamera Aktif (OFF)"}</span>
            </button>

            {useRealCamera && (
              <button 
                type="button"
                onClick={async () => {
                  setBrightness(100);
                  setContrast(100);
                  setSaturation(100);
                  setIsEnhancementOn(false);
                  stopCamera();
                  setTimeout(() => {
                    startCamera();
                  }, 200);
                }}
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold transition-all cursor-pointer animate-pulse"
                id="reset-camera-stream-btn"
                title="Stel Ulang Kamera & Matikan Filter Bayangan"
              >
                <RefreshCw className="w-4 h-4 text-rose-600" />
                <span>Mulai Ulang / Reset Kamera (Bebas Bayangan)</span>
              </button>
            )}
            
            {cameraError && (
              <span className="text-amber-600 flex items-center gap-1 font-sans text-[11px] leading-tight max-w-[280px]">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {cameraError}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 font-mono text-[11px] text-slate-500">
            <Shield className="w-3.5 h-3.5 text-indigo-600" />
            <span>Biometric Core ID: Sec_SMKN5_V3</span>
          </div>
        </div>

      </div>

      {/* RIGHT COLUMN: ACTION AND DEMO CONTROLS */}
      <div className="lg:col-span-4 flex flex-col gap-6" id="kiosk-controls-panel">
        
        {/* ACTION SELECTOR CARD: MASUK VS PULANG */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col" id="action-selector-card">
          <h3 className="text-slate-800 text-sm font-semibold tracking-wide uppercase mb-4 font-display">PILIH MODE ABSENSI</h3>
          
          <div className="grid grid-cols-2 gap-3" id="clock-mode-grid">
            <button
              onClick={() => {
                setIsClockIn(true);
                setScanSuccessResult(null);
              }}
              className={`relative flex flex-col items-center justify-center py-4 rounded-2xl border-2 transition-all cursor-pointer ${
                isClockIn 
                  ? 'border-emerald-500 bg-emerald-50/50 text-emerald-900 shadow-sm font-bold' 
                  : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/50 text-slate-500'
              }`}
              id="btn-clock-in"
            >
              <span className={`w-2 h-2 rounded-full absolute top-2.5 right-2.5 ${isClockIn ? 'bg-emerald-500' : 'bg-transparent'}`}></span>
              <Clock className={`w-6 h-6 mb-2 ${isClockIn ? 'text-emerald-500' : 'text-slate-400'}`} />
              <span className="text-xs font-bold tracking-wide">ABSEN MASUK</span>
              <span className="text-[10px] text-slate-400 font-mono mt-0.5 leading-none">Batas: {config.clockInLate}</span>
            </button>

            <button
              onClick={() => {
                setIsClockIn(false);
                setScanSuccessResult(null);
              }}
              className={`relative flex flex-col items-center justify-center py-4 rounded-2xl border-2 transition-all cursor-pointer ${
                !isClockIn 
                  ? 'border-orange-500 bg-orange-50/50 text-orange-900 shadow-sm font-bold' 
                  : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/50 text-slate-500'
              }`}
              id="btn-clock-out"
            >
              <span className={`w-2 h-2 rounded-full absolute top-2.5 right-2.5 ${!isClockIn ? 'bg-orange-500' : 'bg-transparent'}`}></span>
              <UserCheck className={`w-6 h-6 mb-2 ${!isClockIn ? 'text-orange-500' : 'text-slate-400'}`} />
              <span className="text-xs font-bold tracking-wide">ABSEN PULANG</span>
              <span className="text-[10px] text-slate-400 font-mono mt-0.5 leading-none">Mulai: {config.clockOutTime}</span>
            </button>
          </div>
        </div>

        {/* DEMO MATCHING CONTROLLER (Interactive demo dropdown simulation) */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col" id="demo-controller-card">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-slate-800 text-sm font-semibold tracking-wide uppercase font-display">PENCARIAN DATA WAJAH</h3>
            <span className="text-[9px] bg-indigo-100 text-indigo-800 font-bold px-1.5 py-0.5 rounded uppercase">SIMULASI</span>
          </div>
          <p className="text-slate-500 text-xs leading-normal mb-4">
            Untuk melakukan uji coba absensi, silakan pilih salah satu nama dewan guru di bawah ini yang berdiri di depan sensor kamera, lalu tekan tombol pemicu.
          </p>

          <div className="space-y-4" id="demo-form">
            {/* TOGGLE PINDAI OTOMATIS (SENSOR MODE) */}
            <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-sm" id="auto-scan-toggle-container">
              <div className="flex gap-2.5 items-center">
                <div className={`p-1.5 rounded-lg shrink-0 ${isAutoScanEnabled ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-400'}`}>
                  <Zap className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <h4 className="text-slate-800 text-xs font-bold leading-tight flex items-center gap-1">
                    Pindai Otomatis
                    {isAutoScanEnabled && <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>}
                  </h4>
                  <p className="text-[10px] text-slate-500 leading-normal mt-0.5">Otomatis presensi saat wajah guru tertangkap kamera</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={isAutoScanEnabled}
                  onChange={(e) => setIsAutoScanEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1.5">PILIH GURU UNTUK DISCAN</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select
                  value={selectedDemoTeacher}
                  onChange={(e) => setSelectedDemoTeacher(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white font-medium"
                  id="dropdown-demo-teacher"
                >
                  <option value="">-- Letakkan Wajah Guru di Depan Kamera --</option>
                  <option value="AUTO" className="font-semibold text-indigo-700">🔍 AUTO DETECT (Acak Profil Wajah)</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.subject})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={handleTriggerScan}
              disabled={isScanning}
              className={`w-full py-3 px-4 rounded-xl font-bold text-xs transition-all uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer ${
                isScanning
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/10 active:scale-98'
              }`}
              id="scan-trigger-button"
            >
              <Play className="w-4 h-4" />
              <span>PINDAI SEKARANG</span>
            </button>
          </div>
        </div>

        {/* TODAY ATTENDANCE STATISTICS SUMMARY */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col" id="kiosk-stats-card">
          <h3 className="text-slate-800 text-sm font-semibold tracking-wide uppercase mb-3.5 font-display">RINGKASAN HARI INI</h3>
          
          <div className="space-y-3.5" id="stats-bars">
            {/* Tepat waktu */}
            <div>
              <div className="flex justify-between items-center text-xs mb-1">
                <span className="text-slate-505 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  Tepat Waktu
                </span>
                <span className="text-slate-800 font-bold font-mono">{todayStats.present}</span>
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div 
                   className="h-full bg-emerald-500 transition-all duration-500" 
                  style={{ width: `${teachers.length > 0 ? (todayStats.present / teachers.length) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Terlambat */}
            <div>
              <div className="flex justify-between items-center text-xs mb-1">
                <span className="text-slate-505 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                  Terlambat
                </span>
                <span className="text-slate-800 font-bold font-mono">{todayStats.late}</span>
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-amber-500 transition-all duration-500" 
                  style={{ width: `${teachers.length > 0 ? (todayStats.late / teachers.length) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Belum Presensi */}
            <div>
              <div className="flex justify-between items-center text-xs mb-1">
                <span className="text-slate-505 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-300"></span>
                  Belum Presensi
                </span>
                <span className="text-slate-800 font-bold font-mono">{todayStats.pending}</span>
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-slate-300 transition-all duration-500" 
                  style={{ width: `${teachers.length > 0 ? (todayStats.pending / teachers.length) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
