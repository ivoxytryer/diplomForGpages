import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '@/app/layout/app-layout';
import { RequireAuth, RequireRole } from '@/features/auth/guards';
import { LoginPage } from '@/pages/login-page';
import { RouteErrorPage } from '@/pages/route-error-page';
import type { Role } from '@/shared/types';

const DashboardPage = lazy(() =>
  import('@/pages/dashboard-page').then((module) => ({ default: module.DashboardPage })),
);
const MePage = lazy(() => import('@/pages/me-page').then((module) => ({ default: module.MePage })));
const ChangePasswordPage = lazy(() =>
  import('@/pages/change-password-page').then((module) => ({
    default: module.ChangePasswordPage,
  })),
);
const EmployeesPage = lazy(() =>
  import('@/pages/employees-page').then((module) => ({ default: module.EmployeesPage })),
);
const EmployeePage = lazy(() =>
  import('@/pages/employee-page').then((module) => ({ default: module.EmployeePage })),
);
const OrgStructurePage = lazy(() =>
  import('@/pages/org-structure-page').then((module) => ({
    default: module.OrgStructurePage,
  })),
);
const DepartmentsPage = lazy(() =>
  import('@/pages/departments-page').then((module) => ({ default: module.DepartmentsPage })),
);
const PositionsPage = lazy(() =>
  import('@/pages/positions-page').then((module) => ({ default: module.PositionsPage })),
);
const ProjectsPage = lazy(() =>
  import('@/pages/projects-page').then((module) => ({ default: module.ProjectsPage })),
);
const ProjectPage = lazy(() =>
  import('@/pages/project-page').then((module) => ({ default: module.ProjectPage })),
);
const TasksPage = lazy(() =>
  import('@/pages/tasks-page').then((module) => ({ default: module.TasksPage })),
);
const TimesheetPage = lazy(() =>
  import('@/pages/timesheet-page').then((module) => ({ default: module.TimesheetPage })),
);
const AbsencesPage = lazy(() =>
  import('@/pages/absences-page').then((module) => ({ default: module.AbsencesPage })),
);
const WorkloadPage = lazy(() =>
  import('@/pages/workload-page').then((module) => ({ default: module.WorkloadPage })),
);
const EventsPage = lazy(() =>
  import('@/pages/events-page').then((module) => ({ default: module.EventsPage })),
);
const ReportsPage = lazy(() =>
  import('@/pages/reports-page').then((module) => ({ default: module.ReportsPage })),
);
const UsersPage = lazy(() =>
  import('@/pages/users-page').then((module) => ({ default: module.UsersPage })),
);
const AuditPage = lazy(() =>
  import('@/pages/audit-page').then((module) => ({ default: module.AuditPage })),
);
const ForbiddenPage = lazy(() =>
  import('@/pages/forbidden-page').then((module) => ({ default: module.ForbiddenPage })),
);
const NotFoundPage = lazy(() =>
  import('@/pages/not-found-page').then((module) => ({ default: module.NotFoundPage })),
);

const staff: Role[] = ['admin', 'hr', 'manager'];
const everyone: Role[] = ['admin', 'hr', 'manager', 'employee'];

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage />, errorElement: <RouteErrorPage /> },
  {
    element: <RequireAuth />,
    errorElement: <RouteErrorPage />,
    children: [
      { path: 'change-password', element: <ChangePasswordPage /> },
      {
        element: <AppLayout />,
        children: [
          {
            index: true,
            element: (
              <RequireRole roles={staff}>
                <DashboardPage />
              </RequireRole>
            ),
          },
          { path: 'me', element: <MePage /> },
          {
            path: 'employees',
            element: (
              <RequireRole roles={staff}>
                <EmployeesPage />
              </RequireRole>
            ),
          },
          {
            path: 'employees/:id',
            element: (
              <RequireRole roles={staff}>
                <EmployeePage />
              </RequireRole>
            ),
          },
          {
            path: 'directory',
            element: <Navigate to="/directory/departments" replace />,
          },
          {
            path: 'directory/structure',
            element: (
              <RequireRole roles={staff}>
                <OrgStructurePage />
              </RequireRole>
            ),
          },
          {
            path: 'directory/departments',
            element: (
              <RequireRole roles={['admin', 'hr']}>
                <DepartmentsPage />
              </RequireRole>
            ),
          },
          {
            path: 'directory/positions',
            element: (
              <RequireRole roles={['admin', 'hr']}>
                <PositionsPage />
              </RequireRole>
            ),
          },
          {
            path: 'projects',
            element: (
              <RequireRole roles={staff}>
                <ProjectsPage />
              </RequireRole>
            ),
          },
          {
            path: 'projects/:id',
            element: (
              <RequireRole roles={staff}>
                <ProjectPage />
              </RequireRole>
            ),
          },
          {
            path: 'tasks',
            element: (
              <RequireRole roles={everyone}>
                <TasksPage />
              </RequireRole>
            ),
          },
          {
            path: 'timesheet',
            element: (
              <RequireRole roles={everyone}>
                <TimesheetPage />
              </RequireRole>
            ),
          },
          {
            path: 'absences',
            element: (
              <RequireRole roles={everyone}>
                <AbsencesPage />
              </RequireRole>
            ),
          },
          {
            path: 'workload',
            element: (
              <RequireRole roles={everyone}>
                <WorkloadPage />
              </RequireRole>
            ),
          },
          {
            path: 'events',
            element: (
              <RequireRole roles={staff}>
                <EventsPage />
              </RequireRole>
            ),
          },
          {
            path: 'reports',
            element: (
              <RequireRole roles={staff}>
                <ReportsPage />
              </RequireRole>
            ),
          },
          {
            path: 'admin/users',
            element: (
              <RequireRole roles={['admin']}>
                <UsersPage />
              </RequireRole>
            ),
          },
          {
            path: 'admin/audit',
            element: (
              <RequireRole roles={['admin']}>
                <AuditPage />
              </RequireRole>
            ),
          },
          { path: 'forbidden', element: <ForbiddenPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
