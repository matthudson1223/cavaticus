import { Outlet } from '@tanstack/react-router';
import { ErrorBoundary } from '../components/ErrorBoundary';

export function rootComponent() {
  return (
    <ErrorBoundary>
      <Outlet />
    </ErrorBoundary>
  );
}
