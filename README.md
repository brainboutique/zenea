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

## Service Catalog

The Service Catalog lets you structure and publish an organized view of your IT services, linked to applications and business capabilities. It consists of two entity types:

![Universe](documentation/resources/serviceCatalogView.png)

### Sections

A `ServiceCatalogSection` represents a logical grouping or category within the catalog (e.g. "Core Infrastructure", "HR Services"). They are mesh-structured (i.e. multiple "parents" supported) - but typically used hierarchically from end-user perspective. They can link to 'Applications' or non-application 'Services' (like "Create user" or "Setup new report"). Sections support:

- **Hierarchical trees** via the `parents` array — a section can belong to multiple parents, enabling flexible categorization. Root sections have an empty `parents` array.
- **Relations** to `Application`, `ServiceCatalogService`, `UserGroup`, and `BusinessCapability` entities using GraphQL-style edges notation.
- **Sorting** via `sortOrder` to control sibling ordering.
- **Custom fields** defined through `model.json` (see below).
- **Abstract flag** (`abstract: true`) to mark sections that are purely organizational and not directly consumable.

Example section:
```json
{
  "type": "ServiceCatalogSection",
  "id": "a1b2c3d4-...",
  "displayName": "Core Infrastructure",
  "description": "Foundational IT services",
  "parents": [],
  "sortOrder": 10,
  "abstract": false,
  "applications": {
    "edges": [
      { "node": { "factSheet": { "id": "app-1", "type": "Application", "displayName": "ERP System" } } }
    ]
  }
}
```

### Service (ServiceCatalogService)

A `ServiceCatalogService` (also referred to as a Service Catalog Item) represents an individual, consumable service within a section. Services also support hierarchical nesting via `parents` and can relate to other services.

Both entity types can be **exported to PDF and Excel** for stakeholder communication and reporting.

## User Groups & Map Display

User groups can be categorized (e.g. `category: "region"`) and associated with geographic locations using the `countryIsoCode` field. This field accepts **ISO 3166-1 alpha-2** two-letter country codes (e.g. `US`, `DE`, `JP`, `GB`). In addition, all `UserGroups` support a `parent` link to resemble geographical areas or sub-areas, for example "Germany North" or "Europe".

The **Region Map Widget** renders an interactive world map (from bundled GeoJSON data) and highlights countries that have associated user groups. Clicking a country navigates to the corresponding user group. This provides a visual overview of team distribution and regional stakeholder coverage.

Example user group:
```json
{
  "type": "UserGroup",
  "id": "...",
  "displayName": "Operations Germany",
  "category": "region",
  "countryIsoCode": "DE",
  "description": "Operations team covering Germany"
}
```

## Custom Fields

Custom fields can be added to any entity type without modifying the core data model. They are defined per entity type via a `model.json` file placed in the entity type's directory:

```
{basePath}/{EntityType}/model.json
```

### model.json Syntax

```json
{
  "customFields": {
    "fieldName": {
      "label": { "en": "Display Label", "de": "Anzeigelabel" },
      "type": "string",
      "uom": ""
    }
  }
}
```

### Supported Field Types

| Type | Description | Additional Properties |
|------|-------------|----------------------|
| `string` | Single-line text input | — |
| `textarea` | Multi-line text input | — |
| `number` | Numeric input | `uom` (unit of measure, e.g. `"€"`, `"kWh"`) |
| `selectSingle` | Dropdown with single selection | `values: ["Option A", "Option B"]` |
| `selectMultiple` | Multi-select dropdown | `values: ["Value 1", "Value 2", "Value 3"]` |

### Full Example

```json
{
  "customFields": {
    "annualCost": {
      "label": { "en": "Annual Cost", "de": "Jährliche Kosten" },
      "type": "number",
      "uom": "€"
    },
    "serviceTier": {
      "label": { "en": "Service Tier" },
      "type": "selectSingle",
      "values": ["Platinum", "Gold", "Silver", "Bronze"]
    },
    "complianceTags": {
      "label": { "en": "Compliance Tags" },
      "type": "selectMultiple",
      "values": ["GDPR", "SOX", "HIPAA", "PCI-DSS"]
    },
    "notes": {
      "label": { "en": "Notes", "de": "Anmerkungen" },
      "type": "textarea"
    }
  }
}
```

Custom field values are stored directly on the entity JSON and are rendered dynamically in the UI based on the `model.json` definition.

## Customizable Application Table

The Application list view can be tailored per user — columns can be reordered, shown, or hidden. Preferences are persisted so each user sees their preferred layout.

## North Star Handling

The **North Star Classification** helps guide application portfolio transformation by marking applications with a strategic target state. Each application has two related attributes:

| Attribute | Type | Description |
|-----------|------|-------------|
| `northStarClassification` | `string \| null` | The classification value |
| `northStarClassificationDescription` | `string \| null` | Optional free-text notes explaining the classification |

### Classification Values

| Value | Label | Color | Meaning                                                                                                                                                           |
|-------|-------|-------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `null` / empty | None | gray | No classification assigned                                                                                                                                        |
| `northStar` | North Star | green | This application is the strategic target — all others should migrate toward it                                                                                    |
| `candidateNorthStar` | Candidate North Star | amber | This application is a potential North Star, but not yet confirmed                                                                                                 |
| `disputedNorthStar` | Disputed North Star | blue with bolt icon | Competing application in similar capability space are known, currently unclear if one or the other will be the "undesputed" northStar or if both need to be kept. |

When applications are stacked (grouped by display name), the northStar classification is aggregated with priority: `disputedNorthStar` > `northStar` > `candidateNorthStar`.

North Star values can be filtered in list views and the universe view, and are also carried over during LeanIX data imports.

## Repo & Branch via URL

Repositories and branches can be shared and accessed via simple URLs, making it easy to collaborate across teams. Clone URLs with embedded OAuth tokens allow seamless access to remote Git repositories:

```
https://oauth2:github_pat_11Axxxxxxxxxxx@github.com/brainboutique/zenea-data.git
```

The URL encodes both the repository location and the branch, enabling quick switching between different EA models and transformation scenarios.

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
- **Node.js** and **yarn** (for Angular frontend)

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

3. **Enable PHP Extensions**
   Edit `php.ini` and ensure these extensions are enabled:
   ```ini
   extension=fileinfo
   extension=openssl
   ```

4**Install Laravel Globally** (optional)
   ```bash
   composer global require laravel/installer
   ```

5**Install PHP Dependencies**
   ```bash
   cd php
   composer install
   ```

### Angular Frontend Setup

1. **Install Node.js Dependencies**
   ```bash
   cd app
   yarn install
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


As a shortcut, just run ```yarn run api``` to perform both steps!

### Internationalization (i18n)

The Angular app supports multiple languages (English, German, Spanish).

- **Initialize translations**: `yarn run i18n:init`
- **Extract translations**: `yarn run i18n:extract`

## Building for Production

### Build Release Package

From the root directory:

```bash
yarn run release
```

This will:
- Build the Angular frontend (`yarn run release:frontend`)
- Install production PHP dependencies (`yarn run release:api:composer`)
- Build PHP assets if needed (`yarn run release:api:assets`)
- Create a release package (`ZenEA.tgz`)

### Individual Build Commands

- **Frontend only**: `yarn run release:frontend`
- **PHP Composer (production)**: `yarn run release:api:composer`
- **PHP Assets**: `yarn run release:api:assets`

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
