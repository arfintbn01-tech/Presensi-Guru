/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from 'xlsx';
import { Teacher, AttendanceRecord } from '../types';

export function exportAttendanceToExcel(
  teachers: Teacher[],
  records: AttendanceRecord[],
  schoolName: string = "SMK Negeri 5 Pulau Taliabu"
) {
  // Create workbook
  const wb = XLSX.utils.book_new();

  // SHEET 1: LAPORAN KEHADIRAN (Attendance Log)
  const logRows = records.map((rec, index) => ({
    "No": index + 1,
    "Tanggal": rec.date,
    "Nama Guru": rec.teacherName,
    "NIP": rec.nip,
    "Mata Pelajaran": rec.subject,
    "Jam Masuk": rec.clockIn || "-",
    "Status Masuk": rec.statusIn || "-",
    "Jam Pulang": rec.clockOut || "-",
    "Status Pulang": rec.statusOut || "-",
    "Keterangan/Catatan": rec.notes || ""
  }));

  const wsLogs = XLSX.utils.json_to_sheet(logRows);

  // Set column widths for logs
  const wscolsLogs = [
    { wch: 6 },  // No
    { wch: 12 }, // Tanggal
    { wch: 28 }, // Nama Guru
    { wch: 24 }, // NIP
    { wch: 28 }, // Mata Pelajaran
    { wch: 12 }, // Jam Masuk
    { wch: 16 }, // Status Masuk
    { wch: 12 }, // Jam Pulang
    { wch: 16 }, // Status Pulang
    { wch: 22 }  // Keterangan
  ];
  wsLogs['!cols'] = wscolsLogs;

  // SHEET 2: DAFTAR GURU (Teacher Database)
  const teacherRows = teachers.map((t, index) => ({
    "No": index + 1,
    "Nama Guru": t.name,
    "NIP": t.nip,
    "Mata Pelajaran / Peran": t.subject,
    "Jenis Kelamin": t.gender,
    "Tanggal Terdaftar": new Date(t.registeredAt).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  }));

  const wsTeachers = XLSX.utils.json_to_sheet(teacherRows);

  // Set column widths for teachers
  const wscolsTeachers = [
    { wch: 6 },  // No
    { wch: 28 }, // Nama Guru
    { wch: 24 }, // NIP
    { wch: 32 }, // Mapel/Peran
    { wch: 16 }, // Jenis Kelamin
    { wch: 20 }  // Tanggal Terdaftar
  ];
  wsTeachers['!cols'] = wscolsTeachers;

  // SHEET 3: RINGKASAN PERSENTASE (Summary & Analytics)
  const totalTeachers = teachers.length;
  const totalRecords = records.length;
  
  // Calculate stats
  const onTimeCount = records.filter(r => r.statusIn === 'Hadir').length;
  const lateCount = records.filter(r => r.statusIn === 'Terlambat').length;
  const permissionCount = records.filter(r => r.statusIn === 'Izin' || r.statusIn === 'Sakit').length;
  const presenceRate = totalTeachers > 0 ? ((records.filter(r => r.clockIn !== null).length) / (totalTeachers * 1)) * 100 : 0; // Simple metric

  const summaryRows = [
    { "Indikator Analisis": "Nama Sekolah", "Nilai": schoolName },
    { "Indikator Analisis": "Total Dewan Guru Terdaftar", "Nilai": totalTeachers },
    { "Indikator Analisis": "Total Transaksi Absensi", "Nilai": totalRecords },
    { "Indikator Analisis": "Total Kehadiran Tepat Waktu", "Nilai": onTimeCount },
    { "Indikator Analisis": "Total Kehadiran Terlambat", "Nilai": lateCount },
    { "Indikator Analisis": "Total Izin/Sakit", "Nilai": permissionCount },
    { "Indikator Analisis": "Tingkat Kehadiran Rata-rata (%)", "Nilai": `${presenceRate.toFixed(1)}%` },
    { "Indikator Analisis": "Sistem Validasi", "Nilai": "Pengenalan Wajah Biometrik (Aktif)" },
    { "Indikator Analisis": "Tanggal Cetak Laporan", "Nilai": new Date().toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }) }
  ];

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  
  const wscolsSummary = [
    { wch: 35 }, // Indikator
    { wch: 45 }  // Nilai
  ];
  wsSummary['!cols'] = wscolsSummary;

  // Append sheets to workbook
  XLSX.utils.book_append_sheet(wb, wsLogs, "Laporan Kehadiran");
  XLSX.utils.book_append_sheet(wb, wsTeachers, "Database Guru");
  XLSX.utils.book_append_sheet(wb, wsSummary, "Ringkasan Statistik");

  // Generate Excel file and trigger download
  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = `Laporan_Absensi_Guru_SMKN5_Taliabu_${dateStr}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
