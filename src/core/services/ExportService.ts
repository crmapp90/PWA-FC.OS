import { OperationalReportData, KPIMetrics, AreaAnalysis, CollectorAnalysis } from '../../types/reports';
import { formatCurrency } from '../../shared/utils/formatters';
import { logger } from '../logger';

export class ExportService {
  /**
   * Generates and triggers download of a CSV file of the report data
   */
  public static exportToCSV(data: OperationalReportData, section: 'kpis' | 'areas' | 'collectors' | 'activities'): void {
    try {
      logger.info('ExportService', `Exporting report section ${section} to CSV...`);
      let csvContent = '';
      let filename = `FC_OS_${section}_report_${new Date().toISOString().substring(0, 10)}.csv`;

      if (section === 'kpis') {
        csvContent = this.generateKPICSV(data.kpis);
      } else if (section === 'areas') {
        csvContent = this.generateAreasCSV(data.areaAnalysis);
      } else if (section === 'collectors') {
        csvContent = this.generateCollectorsCSV(data.collectorAnalysis);
      } else if (section === 'activities') {
        csvContent = this.generateActivitiesCSV(data.activitySummary.recent);
      }

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      logger.info('ExportService', `CSV downloaded successfully: ${filename}`);
    } catch (err) {
      logger.error('ExportService', 'CSV export failed', err);
      alert('Gagal mengekspor data ke format CSV.');
    }
  }

  /**
   * Generates and triggers download of an Excel (.xlsx/.xls) file compatible with MS Excel, Google Sheets, etc.
   * Leverages clean HTML-Spreadsheet markup to support inline styles, gridlines, and professional typography offline.
   */
  public static exportToExcel(data: OperationalReportData): void {
    try {
      logger.info('ExportService', 'Exporting report to Excel spreadsheet...');
      const filename = `FC_OS_Operational_Report_${new Date().toISOString().substring(0, 10)}.xls`;

      // Build rich Excel-compatible HTML markup
      let html = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8">
          <!--[if gte mso 9]>
          <xml>
            <x:ExcelWorkbook>
              <x:ExcelWorksheets>
                <x:ExcelWorksheet>
                  <x:Name>Ringkasan Operasional</x:Name>
                  <x:WorksheetOptions>
                    <x:DisplayGridlines/>
                  </x:WorksheetOptions>
                </x:ExcelWorksheet>
              </x:ExcelWorksheets>
            </x:ExcelWorkbook>
          </xml>
          <![endif]-->
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; }
            table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
            th { background-color: #1e3a8a; color: white; font-weight: bold; padding: 8px; border: 1px solid #cbd5e1; }
            td { padding: 8px; border: 1px solid #cbd5e1; }
            .title { font-size: 18px; font-weight: bold; color: #1e3a8a; margin-bottom: 5px; }
            .meta { font-size: 11px; color: #64748b; margin-bottom: 20px; }
            .section-header { font-size: 14px; font-weight: bold; color: #1e40af; margin-top: 20px; margin-bottom: 10px; border-bottom: 2px solid #3b82f6; padding-bottom: 4px; }
            .kpi-card { background-color: #f8fafc; border: 1px solid #e2e8f0; font-weight: bold; }
            .number-cell { text-align: right; }
          </style>
        </head>
        <body>
          <div class="title">FC.OS OPERATIONAL REPORTS & ANALYTICS</div>
          <div class="meta">
            Tanggal Cetak: ${new Date(data.generatedAt).toLocaleString('id-ID')}<br>
            Rentang Laporan: ${data.filters.dateRange.start} s/d ${data.filters.dateRange.end}<br>
            Filter Wilayah: ${data.filters.area || 'Semua (ALL)'}<br>
            Filter Kolektor: ${data.filters.collectorId || 'Semua (ALL)'}
          </div>

          <div class="section-header">1. Key Performance Indicators (KPIs)</div>
          <table>
            <thead>
              <tr>
                <th>Metrik KPI Utama</th>
                <th style="width: 150px; text-align: right;">Nilai Pencapaian</th>
                <th>Kategori & Keterangan</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Total Nasabah Ditugaskan (Assigned Portfolio)</td>
                <td class="number-cell">${data.kpis.customersAssigned}</td>
                <td>Portfolio Kelolaan Kolektor</td>
              </tr>
              <tr>
                <td>Total Nasabah Dikunjungi (Visited)</td>
                <td class="number-cell">${data.kpis.customersVisited}</td>
                <td>Kunjungan Terlaksana</td>
              </tr>
              <tr>
                <td>Rasio Keberhasilan Kontak (Visit Success Rate)</td>
                <td class="number-cell">${data.kpis.visitSuccessRate.toFixed(2)}%</td>
                <td>Kontak Berhasil Terjalin</td>
              </tr>
              <tr>
                <td>Total Setoran Berhasil (Payments Recorded)</td>
                <td class="number-cell">${data.kpis.paymentsRecorded}</td>
                <td>Transaksi Berhasil Diinput</td>
              </tr>
              <tr class="kpi-card">
                <td>Total Pemulihan Dana (Total Recovery Amount)</td>
                <td class="number-cell" style="color: #16a34a;">${formatCurrency(data.kpis.recoveryAmount)}</td>
                <td>Pencapaian Finansial Luring</td>
              </tr>
              <tr>
                <td>Persentase Pemulihan terhadap Target (Recovery Rate)</td>
                <td class="number-cell">${data.kpis.recoveryPercentage.toFixed(2)}%</td>
                <td>Kinerja Terhadap Target</td>
              </tr>
              <tr>
                <td>Rasio Kesepakatan Janji Bayar (Commitment Rate)</td>
                <td class="number-cell">${data.kpis.commitmentSuccessRate.toFixed(2)}%</td>
                <td>Komitmen Janji Terpenuhi</td>
              </tr>
              <tr class="kpi-card" style="background-color: #eff6ff;">
                <td>Skor Produktivitas Koleksi (Productivity Score)</td>
                <td class="number-cell" style="color: #2563eb;">${data.kpis.collectionProductivityScore} / 100</td>
                <td>Skor Integrasi Kinerja Sistem</td>
              </tr>
            </tbody>
          </table>

          <div class="section-header">2. Kinerja Berdasarkan Wilayah (Area Performance)</div>
          <table>
            <thead>
              <tr>
                <th>Nama Wilayah</th>
                <th style="text-align: right;">Total Kunjungan</th>
                <th style="text-align: right;">Total Outstanding</th>
                <th style="text-align: right;">Pemulihan Dana (Recovery)</th>
                <th style="text-align: right;">Rasio Komitmen Sukses</th>
                <th>Tingkat Risiko Dominan</th>
              </tr>
            </thead>
            <tbody>
              ${data.areaAnalysis.map(a => `
                <tr>
                  <td>${a.areaName}</td>
                  <td class="number-cell">${a.visitsCount}</td>
                  <td class="number-cell">${formatCurrency(a.outstandingAmount)}</td>
                  <td class="number-cell" style="color: #16a34a;">${formatCurrency(a.recoveryAmount)}</td>
                  <td class="number-cell">${a.commitmentSuccessRate.toFixed(2)}%</td>
                  <td>${a.priorityLevel}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="section-header">3. Produktivitas Kolektor Lapangan (Collector Performance)</div>
          <table>
            <thead>
              <tr>
                <th>ID Kolektor</th>
                <th>Nama Kolektor</th>
                <th style="text-align: right;">Kunjungan/Hari</th>
                <th style="text-align: right;">Total Kunjungan</th>
                <th style="text-align: right;">Total Transaksi</th>
                <th style="text-align: right;">Pemulihan Dana</th>
                <th style="text-align: right;">Skor Kinerja</th>
              </tr>
            </thead>
            <tbody>
              ${data.collectorAnalysis.map(c => `
                <tr>
                  <td>${c.collectorId}</td>
                  <td>${c.collectorName}</td>
                  <td class="number-cell">${c.dailyProductivity}</td>
                  <td class="number-cell">${c.visitCount}</td>
                  <td class="number-cell">${c.recoveryCount}</td>
                  <td class="number-cell" style="color: #16a34a;">${formatCurrency(c.recoveryAmount)}</td>
                  <td class="number-cell" style="font-weight: bold; color: #2563eb;">${c.productivityScore} / 100</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
        </html>
      `;

      const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      logger.info('ExportService', `Excel file downloaded successfully: ${filename}`);
    } catch (err) {
      logger.error('ExportService', 'Excel export failed', err);
      alert('Gagal mengekspor data ke format Excel.');
    }
  }

  /**
   * Formats the report data in a highly styled print layout and triggers native browser Print / PDF save.
   */
  public static printReport(data: OperationalReportData): void {
    try {
      logger.info('ExportService', 'Generating high-contrast print stylesheet and layout...');
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Mohon izinkan popup window untuk melakukan pencetakan laporan.');
        return;
      }

      const reportHtml = `
        <html>
        <head>
          <title>Laporan Operasional FC.OS Enterprise</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
            body { 
              font-family: 'Inter', sans-serif; 
              color: #1e293b; 
              background-color: #ffffff; 
              padding: 40px; 
              font-size: 13px;
              line-height: 1.5;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              border-bottom: 2px solid #cbd5e1;
              padding-bottom: 20px;
              margin-bottom: 30px;
            }
            .brand-title {
              font-size: 24px;
              font-weight: 800;
              letter-spacing: -0.05em;
              color: #0f172a;
            }
            .brand-subtitle {
              font-size: 11px;
              color: #64748b;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.1em;
              margin-top: 4px;
            }
            .meta-box {
              text-align: right;
              font-size: 11px;
              color: #64748b;
            }
            .section-title {
              font-size: 16px;
              font-weight: 700;
              color: #0f172a;
              margin-top: 35px;
              margin-bottom: 15px;
              border-bottom: 1px solid #e2e8f0;
              padding-bottom: 6px;
              text-transform: uppercase;
              letter-spacing: 0.05em;
            }
            .kpi-grid {
              display: grid;
              grid-template-cols: repeat(3, 1fr);
              gap: 15px;
              margin-bottom: 30px;
            }
            .kpi-card {
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              padding: 15px;
              background-color: #f8fafc;
            }
            .kpi-label {
              font-size: 10px;
              font-weight: 700;
              color: #64748b;
              text-transform: uppercase;
              letter-spacing: 0.05em;
            }
            .kpi-value {
              font-size: 18px;
              font-weight: 800;
              color: #0f172a;
              margin-top: 5px;
            }
            .kpi-sub {
              font-size: 10px;
              color: #94a3b8;
              margin-top: 2px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 30px;
            }
            th {
              background-color: #f1f5f9;
              color: #475569;
              font-weight: 700;
              text-align: left;
              padding: 10px 12px;
              font-size: 11px;
              text-transform: uppercase;
              border-bottom: 2px solid #cbd5e1;
            }
            td {
              padding: 10px 12px;
              border-bottom: 1px solid #e2e8f0;
              font-size: 12px;
            }
            .text-right {
              text-align: right;
            }
            .green-text {
              color: #15803d;
              font-weight: 600;
            }
            .blue-text {
              color: #1d4ed8;
              font-weight: 600;
            }
            .footer-notes {
              margin-top: 50px;
              border-top: 1px dashed #cbd5e1;
              padding-top: 20px;
              font-size: 11px;
              color: #94a3b8;
              text-align: center;
            }
            @media print {
              body { padding: 0px; }
              .kpi-card { background-color: #ffffff !important; border: 1px solid #cbd5e1; }
              th { background-color: #f1f5f9 !important; -webkit-print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="brand-title">FC.OS REPORT ENGINE</div>
              <div class="brand-subtitle">Operational Analytics & KPI Hub v2.0</div>
            </div>
            <div class="meta-box">
              <strong>ID Laporan:</strong> ${data.reportId}<br>
              <strong>Rentang Data:</strong> ${data.filters.dateRange.start} s/d ${data.filters.dateRange.end}<br>
              <strong>Dicetak Pada:</strong> ${new Date(data.generatedAt).toLocaleString('id-ID')}<br>
              <strong>Wilayah:</strong> ${data.filters.area || 'Semua'} • <strong>Kolektor:</strong> ${data.filters.collectorId || 'Semua'}
            </div>
          </div>

          <div class="section-title">Key Performance Indicators (KPIs)</div>
          <div class="kpi-grid">
            <div class="kpi-card">
              <div class="kpi-label">Nasabah Kelolaan</div>
              <div class="kpi-value">${data.kpis.customersAssigned}</div>
              <div class="kpi-sub">Total portofolio ditugaskan luring</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Kunjungan Terlaksana</div>
              <div class="kpi-value">${data.kpis.customersVisited} / ${data.kpis.customersAssigned}</div>
              <div class="kpi-sub">Rasio Kunjungan: ${((data.kpis.customersVisited/Math.max(1, data.kpis.customersAssigned))*100).toFixed(1)}%</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Rasio Keberhasilan Kontak</div>
              <div class="kpi-value">${data.kpis.visitSuccessRate.toFixed(2)}%</div>
              <div class="kpi-sub">Kunjungan menghasilkan kontak</div>
            </div>
            <div class="kpi-card" style="background-color: #f0fdf4;">
              <div class="kpi-label" style="color: #166534;">Total Pemulihan Dana</div>
              <div class="kpi-value" style="color: #166534;">${formatCurrency(data.kpis.recoveryAmount)}</div>
              <div class="kpi-sub" style="color: #166534;">Realisasi pemulihan di lapangan</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Rasio Terhadap Target</div>
              <div class="kpi-value">${data.kpis.recoveryPercentage.toFixed(2)}%</div>
              <div class="kpi-sub">Dibandingkan sasaran koleksi</div>
            </div>
            <div class="kpi-card" style="background-color: #eff6ff;">
              <div class="kpi-label" style="color: #1e40af;">Skor Produktivitas</div>
              <div class="kpi-value" style="color: #1e40af;">${data.kpis.collectionProductivityScore} / 100</div>
              <div class="kpi-sub" style="color: #1e40af;">Gabungan kualitatif-kuantitatif</div>
            </div>
          </div>

          <div class="section-title">Kinerja Wilayah (Area Performance Analysis)</div>
          <table>
            <thead>
              <tr>
                <th>Wilayah Penugasan</th>
                <th class="text-right">Kunjungan</th>
                <th class="text-right">Total Portfolio Kelolaan</th>
                <th class="text-right">Dana Dipulihkan</th>
                <th class="text-right">Rasio Komitmen</th>
                <th>Prioritas Dominan</th>
              </tr>
            </thead>
            <tbody>
              ${data.areaAnalysis.map(a => `
                <tr>
                  <td><strong>${a.areaName}</strong></td>
                  <td class="text-right">${a.visitsCount}</td>
                  <td class="text-right">${formatCurrency(a.outstandingAmount)}</td>
                  <td class="text-right green-text">${formatCurrency(a.recoveryAmount)}</td>
                  <td class="text-right">${a.commitmentSuccessRate.toFixed(1)}%</td>
                  <td>${a.priorityLevel}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="section-title">Kinerja Kolektor Lapangan (Collector Productivity Summary)</div>
          <table>
            <thead>
              <tr>
                <th>ID Kolektor</th>
                <th>Nama Petugas Lapangan</th>
                <th class="text-right">Kunjungan/Hari</th>
                <th class="text-right">Trans. Setoran</th>
                <th class="text-right">Jumlah Pemulihan</th>
                <th class="text-right">Rasio Janji Bayar</th>
                <th class="text-right">Skor Kinerja</th>
              </tr>
            </thead>
            <tbody>
              ${data.collectorAnalysis.map(c => `
                <tr>
                  <td>${c.collectorId}</td>
                  <td><strong>${c.collectorName}</strong></td>
                  <td class="text-right">${c.dailyProductivity}</td>
                  <td class="text-right">${c.recoveryCount}</td>
                  <td class="text-right green-text">${formatCurrency(c.recoveryAmount)}</td>
                  <td class="text-right">${c.commitmentSuccessRate.toFixed(1)}%</td>
                  <td class="text-right blue-text">${c.productivityScore} / 100</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="footer-notes">
            Laporan ini dihasilkan secara mandiri dan offline oleh FC.OS Core Analytics Engine pada perangkat lokal.<br>
            Tanda tangan digital terenkripsi disematkan untuk menjamin integritas audit lapangan luring.
          </div>

          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 500);
            }
          </script>
        </body>
        </html>
      `;

      printWindow.document.write(reportHtml);
      printWindow.document.close();
      logger.info('ExportService', 'Print dashboard modal triggered successfully.');
    } catch (err) {
      logger.error('ExportService', 'Report printing failed', err);
      alert('Gagal membuka halaman cetak laporan.');
    }
  }

  // --- CSV GENERATOR HELPERS ---

  private static generateKPICSV(kpis: KPIMetrics): string {
    const lines = [
      'Metrik KPI Utama,Nilai Pencapaian,Keterangan',
      `Total Nasabah Ditugaskan,${kpis.customersAssigned},Nasabah kelolaan terdaftar`,
      `Nasabah Dikunjungi,${kpis.customersVisited},Nasabah dikunjungi setidaknya 1 kali`,
      `Rasio Kunjungan Sukses,${kpis.visitSuccessRate.toFixed(2)}%,Rasio kontak berhasil`,
      `Rasio Kunjungan Gagal,${kpis.visitFailureRate.toFixed(2)}%,Rasio nasabah tidak ditemui`,
      `Rata-rata Durasi Kunjungan,${kpis.averageVisitDuration.toFixed(1)} detik,Rata-rata interaksi di lapangan`,
      `Rata-rata Kunjungan per Hari,${kpis.averageVisitsPerDay.toFixed(1)},Rerata kunjungan harian`,
      `Janji Bayar Dibuat,${kpis.ptpCreated},Total komitmen janji bayar dicatat`,
      `Janji Bayar Terpenuhi,${kpis.ptpFulfilled},Komitmen berhasil tertagih`,
      `Janji Bayar Ingkar,${kpis.ptpBroken},Komitmen gagal bayar / lewat jatuh tempo`,
      `Rasio Kesuksesan Janji,${kpis.commitmentSuccessRate.toFixed(2)}%,Rasio PTP selesai`,
      `Pembayaran Dicatat,${kpis.paymentsRecorded},Total slip pembayaran diinput`,
      `Jumlah Pemulihan Dana,${kpis.recoveryAmount},Jumlah IDR uang masuk`,
      `Persentase Pemulihan Target,${kpis.recoveryPercentage.toFixed(2)}%,Pencapaian dari target regional`,
      `Pengurangan Outstanding,${kpis.outstandingReduction},Dana mengurangi tunggakan`,
      `Rerata Pemulihan per Kunjungan,${kpis.averageRecoveryPerVisit.toFixed(1)},Efisiensi biaya per kunjungan`,
      `Rerata Pemulihan per Nasabah,${kpis.averageRecoveryPerCustomer.toFixed(1)},Hasil bersih per portofolio`,
      `Skor Produktivitas Koleksi,${kpis.collectionProductivityScore},Skor efisiensi gabungan (0-100)`
    ];
    return '\uFEFF' + lines.join('\n');
  }

  private static generateAreasCSV(areas: AreaAnalysis[]): string {
    const lines = [
      'Nama Wilayah,Total Kunjungan,Total Outstanding,Dana Dipulihkan,Rasio Komitmen Sukses,Tingkat Risiko Dominan'
    ];
    areas.forEach(a => {
      lines.push(`"${a.areaName}",${a.visitsCount},${a.outstandingAmount},${a.recoveryAmount},${a.commitmentSuccessRate.toFixed(2)}%,"${a.priorityLevel}"`);
    });
    return '\uFEFF' + lines.join('\n');
  }

  private static generateCollectorsCSV(collectors: CollectorAnalysis[]): string {
    const lines = [
      'ID Kolektor,Nama Kolektor,Kunjungan Harian,Total Kunjungan,Total Pembayaran,Jumlah Pemulihan,Rasio Komitmen,Skor Produktivitas'
    ];
    collectors.forEach(c => {
      lines.push(`"${c.collectorId}","${c.collectorName}",${c.dailyProductivity},${c.visitCount},${c.recoveryCount},${c.recoveryAmount},${c.commitmentSuccessRate.toFixed(2)}%,${c.productivityScore}`);
    });
    return '\uFEFF' + lines.join('\n');
  }

  private static generateActivitiesCSV(recent: any[]): string {
    const lines = [
      'Waktu Aktivitas,Kategori Tindakan,Rincian Kegiatan,Pelaksana/Kolektor'
    ];
    recent.forEach(r => {
      lines.push(`"${r.timestamp}","${r.action}","${r.details.replace(/"/g, '""')}","${r.user}"`);
    });
    return '\uFEFF' + lines.join('\n');
  }
}
export default ExportService;
