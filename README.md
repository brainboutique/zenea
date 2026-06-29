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
| `link` | Read-only hyperlink derived from entity properties | `templateLabel` (link text), `templateTarget` (URL with `${property}` placeholders) |

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
    },
    "leanIX": {
      "label": { "en": "LeanIX" },
      "type": "link",
      "templateLabel": "LeanIX",
      "templateTarget": "https://demo.leanix.net/Holcim/factsheet/Application/${id}"
    }
  }
}
```

The `link` type renders as a clickable hyperlink in the UI and Excel export. The `templateTarget` URL supports `${property}` placeholders that are resolved against root-level entity properties (e.g., `${id}`, `${displayName}`). The `templateLabel` is displayed as the link text.

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

## Authorization

ZenEA provides a fine-grained, role-based permission model that controls which attributes of which entities a user can see and modify, scoped to specific repositories and branches.

### Overview

Authorization is configured via two files:

| File | Purpose |
|------|---------|
| `/data/.auth.json` | Maps users to admin status and repository-level role assignments |
| `/data/.roles.json` | Defines roles with ordered, firewall-like attribute permission rules |

**Admin users** (`isAdmin: true`) bypass all attribute-level restrictions — they can read and write everything across all repositories.

**Regular users** are assigned one or more roles per repository/branch. Roles define which attributes are readable and which are writable using an ordered rule list (first match wins).

### `.auth.json`

```json
{
  "admin@example.com": {
    "access": true,
    "isAdmin": true
  },
  "demo": {
    "access": true,
    "repositories": {
      "zenea-data-test/master": ["applicationOwner"],
      "zenea-data-test/dev": ["applicationOwner", "serviceOwner"]
    }
  },
  "viewer": {
    "access": true
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `access` | boolean | Required. Set to `true` to allow login |
| `isAdmin` | boolean | If `true`, full access to all repos and attributes (bypasses role rules) |
| `repositories` | object | Maps `repo/branch` keys to arrays of role names |

### `.roles.json`

Roles are defined with an ordered list of rules evaluated top-to-bottom (first match wins). Each rule specifies an optional entity type pattern, an optional attribute regexp, and a permission.

```json
{
  "applicationOwner": {
    "rules": [
      {"attribute": "id|displayName|description", "permission": "read"},
      {"attribute": "tags|status", "permission": "read"},
      {"attribute": "earmarkingsTEMP", "permission": "write"},
      {"permission": "none"}
    ]
  },
  "serviceOwner": {
    "rules": [
      {"attribute": "id|displayName|description|status", "permission": "write"},
      {"entity": "Application", "attribute": ".*rel", "permission": "read"},
      {"permission": "none"}
    ]
  }
}
```

#### Rule Evaluation

| Field | Required | Description |
|-------|----------|-------------|
| `entity` | No | Entity type regexp to match (e.g. `"Application"`, `".*"`). If omitted, matches all entity types. |
| `attribute` | No | Attribute name regexp, implicitly anchored (`^...$`). If omitted, matches all attributes. |
| `permission` | Yes | One of `"read"`, `"write"`, or `"none"` |

- **`write`** implicitly grants `read`
- If no rule matches an attribute, the result is `none`
- When multiple roles are assigned, the **highest privilege** wins per attribute
- Core attributes (`id`, `type`, `displayName`, `description`) are always readable regardless of rules

#### Default (catch-all) Rule

Every role must end with a catch-all rule (no entity/attribute specified) that defines the default permission for unmatched attributes. This is shown as "Default" in the role editor.

### Permission Model

| Permission | Read | Write | Notes |
|------------|------|-------|-------|
| `none` | no | no | Attribute is hidden from UI and API responses |
| `read` | yes | no | Attribute visible in read-only mode |
| `write` | yes | yes | Full access (read + write) |

### API Behavior

**GET responses** include two headers indicating attribute-level permissions:

- `X-Readable-Attributes: id,displayName,status,...` — attributes the user can see
- `X-Writable-Attributes: id,displayName,...` — attributes the user can modify

If headers are absent, all attributes are accessible (admin or unrestricted mode).

**PUT/PATCH requests** are rejected with `403` if any attribute in the payload is not writable.

### Frontend Behavior

- **List table**: Non-readable columns show a `disabled_visible` icon; column selector strikes through restricted columns. Non-readable columns are excluded from Excel and PDF exports.
- **Entity edit page**: Non-readable fields are omitted entirely. Non-writable fields display as plain text with ellipsis (no input controls, no pointer cursor).
- **Status filter**: An `ACTIVE` / `ARCHIVED` pill toggle filters the application list (default: `ACTIVE`, persisted via query param only when not default).

### Manage Users / Manage Roles (Admin UI)

Admins can manage users and roles via the admin menu:

- **Manage Users**: Toggle admin status, assign repositories with role selections, manage passwords.
- **Manage Roles**: Create/delete roles, add/remove/reorder rules (drag & drop), edit entity type, attribute regexp, and permission per rule. Changes persist immediately with 300ms debounce.

### Access Levels Summary

| Level | Can Read | Can Write | Git Clone | Create Branch | Manage Users |
|-------|----------|-----------|-----------|---------------|-------------|
| No access | — | — | — | — | — |
| Role-based | Per role rules | Per role rules | — | — | — |
| Admin (`isAdmin`) | All | All | Yes | Yes | Yes |



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

Users must be listed in `/data/.auth.json` with access enabled (see [Authorization](#authorization) below).

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
   php artisan auth:user-create admin --password=secret --admin --auto-discover-repos
   php artisan auth:user-create viewer --password=view --auto-discover-repos
   ```

   This creates entries in:
   - `/data/.htpasswd` (bcrypt password hashes)
   - `/data/.auth.json` (access permissions and roles)

   Options:
   - `--password=secret` - Set password (will prompt if not provided)
   - `--admin` - Grant admin privileges (full access to all repos)
   - `--auto-discover-repos` - Automatically discover and add existing repositories with default role

3. **Static password fallback (optional):**
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


# Persistence & Folder Structure

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
