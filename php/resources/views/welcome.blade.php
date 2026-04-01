<!--
 Copyright (C) 2026 BrainBoutique Solutions GmbH (Wilko Hein)

 This program is free software: you can redistribute it and/or modify
 it under the terms of the GNU Affero General Public License as
 published by the Free Software Foundation, version 3.

 This program is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU Affero General Public License for more details.

 You should have received a copy of the GNU Affero General Public License along with this program.  If not, see <https://www.gnu.org>.
-->

<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ZenEA</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 40px; }
      .card { max-width: 720px; padding: 24px; border: 1px solid #ddd; border-radius: 12px; }
      code { background: #f6f6f6; padding: 2px 6px; border-radius: 6px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>ZenEA</h1>
      <p><strong>SPA not found.</strong> The Angular frontend should be at <code>public/index.html</code> but it is missing on this server.</p>
      <p>Deploy using the release TAR built with <code>npm run release</code> (from the repo root). That build includes the Angular app in <code>public/</code>. If you deployed only the Laravel folder or an old TAR, copy the contents of <code>app/dist/zenea/browser</code> (or <code>app/dist/l8er-web</code>) into this server’s <code>public/</code> directory.</p>
      <p>API docs (if enabled): <code>/api/documentation</code></p>
    </div>
  </body>
</html>
