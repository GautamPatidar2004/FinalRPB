import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '../layouts/AppLayout';
import {
  DashboardPage,
  MaintenanceRequestsPage,
  AssetsPage,
  CorridorsPage,
  OperationalDataPage,
  PlanningPage,
  PlanReviewPage,
  MonitoringPage,
  NotFoundPage,
} from '../pages';

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="requests" element={<MaintenanceRequestsPage />} />
        <Route path="assets" element={<AssetsPage />} />
        <Route path="corridors" element={<CorridorsPage />} />
        <Route path="operational-data" element={<OperationalDataPage />} />
        <Route path="planning" element={<PlanningPage />} />
        <Route path="review" element={<PlanReviewPage />} />
        <Route path="review/:planId" element={<PlanReviewPage />} />
        <Route path="monitoring" element={<MonitoringPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};
