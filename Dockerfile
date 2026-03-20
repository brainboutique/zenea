# Build stage: install Composer dependencies
FROM composer:2 AS composer
WORKDIR /app

COPY php/composer.json php/composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist

COPY php/ ./
RUN composer dump-autoload --optimize --classmap-authoritative --no-scripts

# Inject build version into PHP runtime (app/build-version.php) using tools/release.mjs.
FROM node:20-alpine AS php-inject
WORKDIR /work
COPY --from=composer /app ./php
COPY tools/release.mjs ./tools/release.mjs
ARG RELEASE_BUILD_NUMBER
RUN RELEASE_PHP_ONLY=1 RELEASE_KEEP_PATCHED=1 RELEASE_BUILD_NUMBER="${RELEASE_BUILD_NUMBER}" node ./tools/release.mjs

# Build stage: compile Angular app
FROM node:20-alpine AS frontend
WORKDIR /app
COPY app/package.json app/package-lock.json ./
RUN npm ci
COPY app/ ./
COPY tools/release.mjs ./tools/release.mjs
ARG RELEASE_BUILD_NUMBER
RUN RELEASE_FRONTEND_ONLY=1 RELEASE_BUILD_NUMBER="${RELEASE_BUILD_NUMBER}" node ./tools/release.mjs

# Runtime: Apache + PHP (8.4 matches composer platform)
FROM php:8.4-apache

RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

RUN a2enmod rewrite headers expires

# Disable default Alias /icons/ -> /usr/share/apache2/icons/ so our app can serve /icons/*.png
RUN sed -i '/^Alias \/icons\//d' /etc/apache2/mods-available/alias.conf

# Explicit document root: use our vhost so /php/public is served (static files like /icons/*.png work)
COPY docker/apache-vhost.conf /etc/apache2/sites-available/000-default.conf

# Bake /php/public into any remaining Apache config (sed with double quotes so shell expands at build time)
ENV APACHE_DOCUMENT_ROOT=/php/public
RUN sed -ri -e "s!/var/www/html!$APACHE_DOCUMENT_ROOT!g" /etc/apache2/sites-available/*.conf \
    && sed -ri -e "s!/var/www/!$APACHE_DOCUMENT_ROOT!g" /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf

# Copy application and vendor from composer stage
COPY --from=php-inject /work/php /php

# Copy compiled Angular app into Laravel public (SPA assets and index.html)
COPY --from=frontend /app/dist/zenea/browser/. /php/public/

# Log to stderr so errors show up in `docker logs` (no need to exec into container to read storage/logs)
ENV LOG_CHANNEL=stderr
ENV LOG_LEVEL=debug

# Writable dirs for Laravel (bootstrap/cache, framework storage) and project data at /data
RUN mkdir -p /data /php/storage/framework/sessions /php/storage/framework/views \
    /php/storage/framework/cache/data /php/storage/logs /php/bootstrap/cache \
    && git config --global --add safe.directory /data

# Generate Laravel package discovery cache (production packages only; no dev deps in image)
RUN cd /php && php artisan package:discover --ansi

RUN chown -R www-data:www-data /php/storage /php/bootstrap/cache /data

# Entrypoint: ensure APP_KEY exists at runtime, then start Apache
COPY docker-entrypoint.sh /usr/local/bin/
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
    && chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["apache2-foreground"]

# Mountable data directory (entity JSON files, meta, etc.) at project root
ENV DATA_PATH=/data
VOLUME /data

EXPOSE 80
