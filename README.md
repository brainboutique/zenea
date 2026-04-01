# ZenEA

ZenEA is a open-source solution to manage Enterprise Architectures, with a strong focus on Application Portfolio lifecycle management and rationalization strategies.

You can import data from LeanIX to seamlessly continue with existing inventories – or start capturing your portfolio from scratch in a Git-backed, fully versioned way.

# Capabilities

Applications can easily managed within the snappy "List" editor - or on a drill-down editing page for a single application.

![List View](documentation/resources/listView.png)

A strong focus is put on the ease of management of Business Capabilities and Migration Paths. The backing GIT storage allows easy modelling of different transformation scenarios.

![Transformation Map](documentation/resources/migrationMap.png)

Based on the automatically calculated Jaccard distance, selection of "most likely" migration candidates or the inspection of applications supporting similar capability sets is possibe:

![Universe](documentation/resources/universe.png)


# Deployment
Two alternative approaches are provided to quickly and easily deploy your own ZenEA service:
## Docker

To deploy a local instance, simply deploy docker image ```brainboutique/zenea:latest```
Alternatively refer to ```dockercompose_coolify.yml``` for a copy/paste template to set up in Coolify. 

## Folder

You can build the application locally and produce a ZIP file that may be uploaded to a PHP-enabled webspace.

# Getting Started

Upon initial setup, a "Welcome Screen" is displayed which will allow creation of a few sample applications. Alternatively these can be created from the Applications view individually.
For more advanced use cases, via "Admin" > "Git Clone" a repository can be cloned. By default, the main branch is checked out. Note that the OAuth token must be included in the clone URL, for example

```https://oauth2:github_pat_11Axxxxxxxxxxx@github.com/brainboutique/zenea-data.git```

See https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens.


## Authentication

ZenEA supports two authentication modes: **Google OAuth** and **Local file-based authentication**. Authentication is disabled by default.

### Google OAuth

Configure Google OAuth in your `.env` file:

```env
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_BASE_URL=https://zenea.mycompany.com
```

Users must be listed in `/data/.auth.json` with access enabled:

```json
{
  "user@example.com": {
    "access": true,
    "role": "admin",
    "read": ["local/default", "repo1/main"],
    "edit": ["local/default"]
  }
}
```

### Local Authentication

For deployments without Google OAuth, use local file-based authentication:

1. **Configure in `.env`:**
   ```env
   AUTHENTICATION=Local
   JWT_SECRET=your-256-bit-secret-key
   ```

   Generate a secure secret:
   ```bash
   openssl rand -base64 32
   ```

2. **Create users:**
   ```bash
   php artisan auth:user-create admin --password=secret --role=admin --auto-discover-repos
   php artisan auth:user-create viewer --password=view --role=user --auto-discover-repos
   ```

   This creates entries in:
   - `/data/.htpasswd` (bcrypt password hashes)
   - `/data/.auth.json` (access permissions and roles)

   Options:
   - `--password=secret` - Set password (will prompt if not provided)
   - `--role=user|admin` - User role (default: user). Use `--role=admin` for git clone, create branch
   - `--auto-discover-repos` - Automatically discover and add existing repositories as read access

 3. **User roles:**
    - `admin` - Full access (git clone, create branch, all read/edit)
    - `user` - Standard access (read/edit based on authorization)

 4. **Static password fallback (optional):**
    For development or recovery purposes, you can set a static password that works as a fallback
    for the "admin" user (in addition to the .htpasswd file):
    ```env
    ADMIN_PASSWORD_LOCAL=your-static-password
    ```
    When set, this password can be used to authenticate as "admin" even if the .htpasswd file is missing or corrupted.

### Authentication Mode Selection

| Mode | Environment | Description |
|------|-------------|-------------|
| None | `AUTHENTICATION=` (empty) | No authentication required |
| Google | `AUTHENTICATION=Google` | Google OAuth authentication |
| Local | `AUTHENTICATION=Local` | Local htpasswd file authentication |

## Authorization

When authentication is enabled, ZenEA supports repository-level authorization to control user access to different repositories and branches.

### Authorization in `.auth.json`

The `.auth.json` file controls both authentication and authorization:

```json
{
  "admin": {
    "access": true,
    "role": "admin",
    "read": ["local/default", "repo1/main"],
    "edit": ["local/default"]
  },
  "viewer": {
    "access": true,
    "role": "user",
    "read": ["local/default"],
    "edit": []
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `access` | boolean | Required. Set to `true` to allow login |
| `role` | string | User role: `admin` or `user`. Admins have implicit edit access to all repos |
| `read` | array | Repositories user can view (format: `repo/branch`) |
| `edit` | array | Repositories user can modify (format: `repo/branch`). Admins can edit all repos implicitly |

### Access Levels

- **Read access**: User can view entities in the repository/branch
- **Edit access**: User can view AND modify entities (includes read). Admins have edit access to all repos
- **Admin access** (`role: "admin"`): User can do all of the above PLUS git clone, create branch, pull new branches

### API Protection

| API Endpoint | Required Access |
|-------------|-----------------|
| GET entities, facets, applications | `read` array |
| PUT/POST/PATCH/DELETE entities, slurp | `edit` array |
| POST git/commit-and-push | `edit` array |
| POST git/pull (new branch) | `admin: true` |
| POST git/clone | `admin: true` |
| GET git/branches | Filtered to user's authorized repos |
| PUT config | `read` access to specified repo |


# Basic concepts

The provided application has as few as possible dependencies: For example, it purely works in the local file system and without the need of a database server, ElasticSearch etc.
All these may improve performance slightly for very large number of applications managed or large number of users - for deployments with 1000 apps and 3 concurrent users the current architecture is perfectly acceptable.

Every Application is represented as a JSON file on disk, linked to a Git repository and branch:

```/data/<gitRepoName>/<gitBranchName>/<EntityType>/<ID>.json```

e.g.

```/data/myea/master/Application/12c8ba76-27d5-4479-b3bd-7778c60f0665.json```

The "Manage Branches" admin area lets you check out additional branches and start working with them. Changes you make in list and detail views are auto-saved. To capture explicit snapshots, use the "Git Commit" command and rely on your Git provider for diffing, branching, and merging.


## Project Structure

```
zenea/
├── app/          # Angular frontend application
├── php/          # Laravel backend API
└── tools/        # Build and release scripts
```

## Prerequisites

- **PHP 8.2+** (PHP 8.4 recommended)
- **Composer** (PHP dependency manager)
- **Node.js** and **npm** (for Angular frontend)

## Development Setup

### PHP Backend Setup

#### Windows Installation

1. **Install PHP**
   - Download from: https://windows.php.net/download/
   - Unzip to desired location (e.g., `C:\Program Files\PHP8.5`)
   - Add PHP path to your `PATH` environment variable
   - Rename `php.ini.development` to `php.ini`

2. **Install Composer**
   - Download and install from: https://getcomposer.org/download/

3. **Install SQLite Driver**
   - Download from: https://www.sqlite.org/download.html
   - Place SQLite DLL in your PHP `ext` folder (e.g., `C:\Program Files\PHP8.5\ext`)

4. **Enable PHP Extensions**
   Edit `php.ini` and ensure these extensions are enabled:
   ```ini
   extension=fileinfo
   ```

5. **Install Laravel Globally** (optional)
   ```bash
   composer global require laravel/installer
   ```

6. **Install PHP Dependencies**
   ```bash
   cd php
   composer install
   ```

### Angular Frontend Setup

1. **Install Node.js Dependencies**
   ```bash
   cd app
   npm install
   ```

## Running Locally

### Start PHP Backend

```bash
cd php
php artisan serve
```

The API will be available at `http://127.0.0.1:8000`

### Start Angular Frontend

```bash
cd app
ng serve
```

The application will be available at `http://localhost:4200`

### Quick Start (Windows)

You can use the provided `zenea.bat` script to launch both servers in Windows Terminal:

```bash
zenea.bat
```

# API Documentation (Swagger)

After starting the PHP backend, access the API documentation at:

```
http://127.0.0.1:8000/api/documentation
```

## Development Workflows

### API Changes

When making changes to the PHP API:

1. **Generate Swagger Documentation**
   ```bash
   cd php
   php artisan l5-swagger:generate
   ```

2. **Regenerate Angular API Client**
   ```bash
   cd app
   node_modules\.bin\openapi-generator-cli generate -g typescript-angular -i ../php/storage/api-docs/api-docs.json -o src/app/services/api
   ```


As a shortcut, just run ```npm run api``` to perform both steps!

### Internationalization (i18n)

The Angular app supports multiple languages (English, German, Spanish).

- **Initialize translations**: `npm run i18n:init`
- **Extract translations**: `npm run i18n:extract`

## Building for Production

### Build Release Package

From the root directory:

```bash
npm run release
```

This will:
- Build the Angular frontend (`npm run release:frontend`)
- Install production PHP dependencies (`npm run release:api:composer`)
- Build PHP assets if needed (`npm run release:api:assets`)
- Create a release package (`l8er.tgz`)

### Individual Build Commands

- **Frontend only**: `npm run release:frontend`
- **PHP Composer (production)**: `npm run release:api:composer`
- **PHP Assets**: `npm run release:api:assets`

## CI/CD

The project includes a GitLab CI/CD pipeline (`.gitlab-ci.yml`) that:

1. **Tests**: Runs PHP unit tests
2. **Builds**: Creates production release package
3. **Releases**: Creates GitLab release with build number
4. **Doccker Container**: Builds and uploads the Docker container 

## Technology Stack

### Backend
- **Framework**: Laravel 12.50
- **PHP**: 8.2+ (8.4 recommended)
- **API Documentation**: L5-Swagger

### Frontend
- **Framework**: Angular 19
- **UI Library**: Angular Material
- **Internationalization**: ngx-translate
- **API Client**: OpenAPI Generator (TypeScript Angular)

## License

GNU General Public License
