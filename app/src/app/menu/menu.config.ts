export interface MenuRoute {
  segments: string[];
  absolute?: boolean;
  queryParams?: Record<string, string>;
  exact?: boolean;
}

export type MenuVisibility = 'canEdit' | 'adminOrSingleUser' | 'canManageUsers' | 'loggedIn';

export type MenuAction =
  | 'git-branches'
  | 'git-clone'
  | 'git-commit'
  | 'git-pull'
  | 'settings'
  | 'sample-data'
  | 'slurp-leanix'
  | 'manage-users'
  | 'manage-roles'
  | 'logout';

export interface MenuItem {
  id: string;
  label: string;
  route?: MenuRoute;
  action?: MenuAction;
  visible?: MenuVisibility;
  children?: MenuItem[];
}

export const APP_MENU: MenuItem[] = [
  {
    id: 'home',
    label: 'Home',
    route: { segments: [], absolute: true, exact: true },
  },
  {
    id: 'portfolio',
    label: 'Portfolio',
    route: { segments: ['list', 'Applications'] },
    children: [
      {
        id: 'applications',
        label: 'Applications',
        route: { segments: ['list', 'Applications'] },
      },
      {
        id: 'catalog',
        label: 'Catalog',
        route: { segments: ['list', 'Applications'], queryParams: { view: 'ServiceCatalog' } },
      },
      {
        id: 'migrations',
        label: 'Migrations',
        route: { segments: ['list', 'migrations'] },
      },
    ],
  },
  {
    id: 'business',
    label: 'Business',
    route: { segments: ['list', 'ServiceCatalog'] },
    children: [
      {
        id: 'service-catalog',
        label: 'Service Catalog',
        route: { segments: ['list', 'ServiceCatalog'] },
      },
      {
        id: 'processes',
        label: 'Processes',
        route: { segments: ['list', 'BusinessProcesses'] },
      },
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    route: { segments: ['analytics', 'reports'] },
    children: [
      {
        id: 'reports',
        label: 'Reports',
        route: { segments: ['analytics', 'reports'] },
      },
      {
        id: 'history',
        label: 'History',
        route: { segments: ['analytics', 'history'] },
      },
      {
        id: 'universe',
        label: 'Universe',
        route: { segments: ['universe'] },
      },
      {
        id: 'transformation-map',
        label: 'Transformation Map',
        route: { segments: ['map', 'Application', 'transformation'] },
      },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    children: [
      {
        id: 'dataset',
        label: 'Dataset',
        action: 'git-branches',
      },
      {
        id: 'master-data',
        label: 'Master Data',
        children: [
          {
            id: 'business-capabilities',
            label: 'Business Capabilities',
            route: { segments: ['tree', 'BusinessCapabilities'] },
          },
          {
            id: 'user-groups',
            label: 'User Groups',
            route: { segments: ['tree', 'UserGroups'] },
          },
        ],
      },
      {
        id: 'git',
        label: 'GIT',
        children: [
          {
            id: 'git-clone',
            label: 'Clone',
            action: 'git-clone',
            visible: 'adminOrSingleUser',
          },
          {
            id: 'git-pull',
            label: 'Pull',
            action: 'git-pull',
            visible: 'adminOrSingleUser',
          },
          {
            id: 'git-commit',
            label: 'Commit',
            action: 'git-commit',
            visible: 'canEdit',
          },
        ],
      },
      {
        id: 'preferences',
        label: 'Preferences',
        action: 'settings',
      },
      {
        id: 'system',
        label: 'System',
        children: [
          {
            id: 'generate-sampledata',
            label: 'Generate Sampledata',
            action: 'sample-data',
            visible: 'adminOrSingleUser',
          },
          {
            id: 'slurp-leanix',
            label: 'Slurp from LeanIX',
            action: 'slurp-leanix',
            visible: 'adminOrSingleUser',
          },
          {
            id: 'roles',
            label: 'Roles',
            action: 'manage-roles',
            visible: 'canManageUsers',
          },
          {
            id: 'users',
            label: 'Users',
            action: 'manage-users',
            visible: 'canManageUsers',
          },
        ],
      },
      {
        id: 'logout',
        label: 'Logout',
        action: 'logout',
        visible: 'loggedIn',
      },
    ],
  },
];
