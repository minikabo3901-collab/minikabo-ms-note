import type { ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@/components/SaveToast';
import { DisclaimerGate } from '@/components/DisclaimerGate';
import { UpdatePrompt } from '@/components/UpdatePrompt';
import { HomePage } from '@/pages/HomePage';
import { RecordPage } from '@/pages/RecordPage';
import { WeeklyCheckPage } from '@/pages/WeeklyCheckPage';
import { SymptomNewPage } from '@/pages/SymptomNewPage';
import { SymptomDetailPage } from '@/pages/SymptomDetailPage';
import { MedicationsPage } from '@/pages/MedicationsPage';
import { MedicationEditPage } from '@/pages/MedicationEditPage';
import { MedicationCalendarPage } from '@/pages/MedicationCalendarPage';
import { DoseRecordPage } from '@/pages/DoseRecordPage';
import { ObservationDetailPage, ObservationListPage } from '@/pages/ObservationPage';
import { MedicalEditPage, MedicalListPage } from '@/pages/MedicalPage';
import { MeasurementEditPage, MeasurementListPage } from '@/pages/MeasurementsPage';
import { AppointmentEditPage, AppointmentListPage } from '@/pages/AppointmentsPage';
import { ProgressPage } from '@/pages/ProgressPage';
import { ClinicPage, QuestionsPage } from '@/pages/ClinicPage';
import { ReportPage } from '@/pages/ReportPage';
import { SettingsPage } from '@/pages/SettingsPage';

/**
 * ルーティングは HashRouter を使う。
 * ホーム画面に追加した PWA でも、オフライン時でも、
 * サーバー側のルーティング設定なしにすべての画面へ遷移できるため。
 */
export function App(): ReactNode {
  return (
    <ToastProvider>
      <HashRouter>
        <DisclaimerGate>
          <Routes>
            <Route path="/" element={<HomePage />} />

            <Route path="/record" element={<RecordPage />} />
            <Route path="/record/weekly" element={<WeeklyCheckPage />} />
            <Route path="/record/symptom/new" element={<SymptomNewPage />} />
            <Route path="/symptom/:id" element={<SymptomDetailPage />} />

            <Route path="/medications" element={<MedicationsPage />} />
            <Route path="/medications/:id" element={<MedicationEditPage />} />
            <Route path="/medication-calendar" element={<MedicationCalendarPage />} />
            <Route path="/dose/:medId/:date" element={<DoseRecordPage />} />

            <Route path="/observation" element={<ObservationListPage />} />
            <Route path="/observation/:id" element={<ObservationDetailPage />} />

            <Route path="/medical" element={<MedicalListPage />} />
            <Route path="/medical/:id" element={<MedicalEditPage />} />

            <Route path="/measurements" element={<MeasurementListPage />} />
            <Route path="/measurements/:id" element={<MeasurementEditPage />} />

            <Route path="/appointments" element={<AppointmentListPage />} />
            <Route path="/appointments/:id" element={<AppointmentEditPage />} />

            <Route path="/progress" element={<ProgressPage />} />

            <Route path="/clinic" element={<ClinicPage />} />
            <Route path="/clinic/questions" element={<QuestionsPage />} />
            <Route path="/clinic/report" element={<ReportPage />} />

            <Route path="/settings" element={<SettingsPage />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <UpdatePrompt />
        </DisclaimerGate>
      </HashRouter>
    </ToastProvider>
  );
}
