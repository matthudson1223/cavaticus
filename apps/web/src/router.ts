import { createRouter, createRootRoute, createRoute } from '@tanstack/react-router';
import { rootComponent } from './routes/__root';
import { dashboardComponent } from './routes/index';
import { authComponent } from './routes/auth';
import { settingsComponent } from './routes/settings';
import { workspaceComponent } from './routes/project.$id';

const rootRoute = createRootRoute({ component: rootComponent });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: dashboardComponent,
});

const authRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth',
  component: authComponent,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: settingsComponent,
});

const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/project/$id',
  component: workspaceComponent,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  authRoute,
  settingsRoute,
  projectRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
