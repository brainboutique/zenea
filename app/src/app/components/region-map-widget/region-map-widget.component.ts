/*
 * Copyright (C) 2026 BrainBoutique Solutions GmbH (Wilko Hein)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, version 3.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License along with this program.  If not, see <https://www.gnu.org>.
 */

import {
  Component,
  input,
  output,
  effect,
  inject,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { UserGroupsDataService } from '../../services/UserGroupsDataService';
import { ApplicationItem } from '../../services/ApplicationsService';
import type * as L from 'leaflet';

interface CountryGeoJSON {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: {
      name: string;
      iso_a2: string;
      iso_a3: string;
    };
    geometry: any;
  }>;
}

const HIGHLIGHT_COLOR = '#e41a1c';

@Component({
  selector: 'app-region-map-widget',
  standalone: true,
  templateUrl: './region-map-widget.component.html',
  styleUrl: './region-map-widget.component.scss',
})
export class RegionMapWidgetComponent implements OnInit, OnDestroy {
  applications = input<ApplicationItem[]>([]);
  userGroupIds = input<string[]>([]);
  collapsed = input<boolean>(false);

  countryClicked = output<{ isoCode: string; userGroupId: string }>();

  private prevCollapsed = false;

  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;

  private http = inject(HttpClient);
  private userGroupsService = inject(UserGroupsDataService);

  private geoJSON: CountryGeoJSON | null = null;
  private isoA2ToFeatureIndex = new Map<string, number>();
  private isoA2ToCountryName = new Map<string, string>();
  private isoA2ToUserGroupId = new Map<string, string>();
  private isoA2ToAppNames = new Map<string, string[]>();
  private isoA2ToRegionUserGroupId = new Map<string, string>();
  private map: L.Map | null = null;
  private geoJsonLayer: L.GeoJSON | null = null;
  private leafletLoaded = false;

  constructor() {
    effect(() => {
      this.applications();
      this.userGroupIds();
      this.updateMapColors();

      const isCollapsed = this.collapsed();
      if (this.prevCollapsed && !isCollapsed && this.map) {
        this.waitForVisibleAndRefresh();
      }
      this.prevCollapsed = isCollapsed;
    });
  }

  private waitForVisibleAndRefresh(): void {
    if (!this.map || !this.mapContainer) return;
    setTimeout(() => {
      this.map?.invalidateSize();
      this.map?.fitWorld();
      this.updateMapColors();
    }, 300);
  }

  ngOnInit(): void {
    this.userGroupsService.ensureLoaded();
    this.loadGeoJSON();
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  private loadGeoJSON(): void {
    this.http.get<CountryGeoJSON>('/assets/geojson/world-countries.json').subscribe({
      next: (data) => {
        this.geoJSON = data;
        this.buildCountryIndex();
        this.initMap();
      },
      error: () => {
        // Silently fail - map won't render
      },
    });
  }

  private buildCountryIndex(): void {
    if (!this.geoJSON) return;
    this.isoA2ToFeatureIndex.clear();
    this.isoA2ToCountryName.clear();
    this.geoJSON.features.forEach((feature, index) => {
      const iso = feature.properties.iso_a2?.toUpperCase();
      if (iso) {
        this.isoA2ToFeatureIndex.set(iso, index);
        this.isoA2ToCountryName.set(iso, feature.properties.name);
      }
    });
  }

  private async initMap(): Promise<void> {
    if (!this.geoJSON || !this.mapContainer) return;

    const leafletModule = await import('leaflet');
    const L = leafletModule.default;
    if (!this.mapContainer) return;

    this.map = L.map(this.mapContainer.nativeElement, {
      center: [20, 0],
      zoom: 2,
      zoomControl: true,
      dragging: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      touchZoom: true,
      boxZoom: false,
      keyboard: false,
      attributionControl: false,
    });

    this.geoJsonLayer = L.geoJSON(this.geoJSON as any, {
      style: () => ({
        color: '#888',
        weight: 0.8,
        fillColor: '#f0f0f0',
        fillOpacity: 0.5,
      }),
      onEachFeature: (feature: any, layer: L.Layer) => {
        layer.on('mouseover', (e: L.LeafletEvent) => {
          const target = e.target as L.Path;
          target.setStyle({ weight: 2, color: '#333' });
          target.bringToFront();
        });
        layer.on('mouseout', (e: L.LeafletEvent) => {
          const target = e.target as L.Path;
          const iso = feature?.properties?.iso_a2;
          if (iso) {
            const isoUpper = iso.toUpperCase();
            const userGroupId = this.isoA2ToUserGroupId.get(isoUpper);
            const regionUserGroupId = this.isoA2ToRegionUserGroupId.get(isoUpper);
            if (userGroupId) {
              target.setStyle({ weight: 1, color: '#555', fillColor: HIGHLIGHT_COLOR, fillOpacity: 0.6 });
            } else if (regionUserGroupId) {
              target.setStyle({ weight: 1, color: '#555', fillColor: '#d66', fillOpacity: 0.35 });
            } else {
              target.setStyle({ weight: 0.8, color: '#888', fillColor: '#f0f0f0', fillOpacity: 0.5 });
            }
          }
        });
        layer.on('click', () => {
          const iso = feature?.properties?.iso_a2;
          if (iso) {
            const isoUpper = iso.toUpperCase();
            let userGroupId = this.isoA2ToUserGroupId.get(isoUpper);
            if (!userGroupId) {
              userGroupId = this.isoA2ToRegionUserGroupId.get(isoUpper);
            }
            if (userGroupId) {
              this.countryClicked.emit({ isoCode: isoUpper, userGroupId });
            }
          }
        });
      },
    }).addTo(this.map);

    this.leafletLoaded = true;

    setTimeout(() => {
      if (this.mapContainer.nativeElement.offsetWidth > 0) {
        this.map?.fitWorld();
        this.updateMapColors();
      } else {
        this.waitForVisibleAndRefresh();
      }
    }, 0);
  }

  private updateMapColors(): void {
    if (!this.map || !this.geoJsonLayer || !this.leafletLoaded) return;

    const apps = this.applications();
    const ugIds = this.userGroupIds();
    const allUserGroups = this.userGroupsService.getUserGroupsWithIsoCode();
    const regionUserGroups = this.userGroupsService.getRegionUserGroups();

    this.isoA2ToUserGroupId.clear();
    this.isoA2ToAppNames.clear();
    this.isoA2ToRegionUserGroupId.clear();

    for (const rg of regionUserGroups) {
      if (rg.countryIsoCode) {
        const iso = rg.countryIsoCode.toUpperCase();
        if (this.isoA2ToFeatureIndex.has(iso) && !this.isoA2ToRegionUserGroupId.has(iso)) {
          this.isoA2ToRegionUserGroupId.set(iso, rg.id);
        }
      }
    }

    if (ugIds.length > 0) {
      for (const ugId of ugIds) {
        const matchingGroup = allUserGroups.find((g) => g.id === ugId);
        if (matchingGroup?.countryIsoCode) {
          const iso = matchingGroup.countryIsoCode.toUpperCase();
          if (this.isoA2ToFeatureIndex.has(iso)) {
            this.isoA2ToUserGroupId.set(iso, matchingGroup.id);
          }
        }
      }
    } else {
      for (const app of apps) {
        const appUserGroups = app.relApplicationToUserGroup ?? [];
        for (const ug of appUserGroups) {
          const matchingGroup = allUserGroups.find(
            (rg) => rg.id === ug.id || rg.displayName === ug.displayName
          );
          if (matchingGroup?.countryIsoCode) {
            const iso = matchingGroup.countryIsoCode.toUpperCase();
            if (this.isoA2ToFeatureIndex.has(iso)) {
              this.isoA2ToUserGroupId.set(iso, matchingGroup.id);
              const existing = this.isoA2ToAppNames.get(iso) ?? [];
              existing.push(app.displayName);
              this.isoA2ToAppNames.set(iso, existing);
            }
          }
        }
      }
    }

    this.geoJsonLayer.eachLayer((layer: L.Layer) => {
      const geoLayer = layer as L.GeoJSON;
      const feature = geoLayer.feature as { properties: { iso_a2: string; name: string } } | undefined;
      if (!feature?.properties?.iso_a2) return;

      const iso = feature.properties.iso_a2.toUpperCase();
      const userGroupId = this.isoA2ToUserGroupId.get(iso);
      const regionUserGroupId = this.isoA2ToRegionUserGroupId.get(iso);

      if (userGroupId) {
        (layer as L.Path).setStyle({
          fillColor: HIGHLIGHT_COLOR,
          fillOpacity: 0.6,
          color: '#555',
          weight: 1,
        });
      } else if (regionUserGroupId) {
        (layer as L.Path).setStyle({
          fillColor: '#d66',
          fillOpacity: 0.35,
          color: '#555',
          weight: 1,
        });
      } else {
        (layer as L.Path).setStyle({
          fillColor: '#f0f0f0',
          fillOpacity: 0.5,
          color: '#888',
          weight: 0.8,
        });
      }

      (layer as L.Layer).unbindTooltip();
      const appNames = this.isoA2ToAppNames.get(iso);
      if (appNames && appNames.length > 0) {
        const countryName = feature.properties.name;
        const uniqueNames = [...new Set(appNames)];
        const tooltipContent = `<strong>${countryName}</strong><br/>${uniqueNames.join('<br/>')}`;
        (layer as L.Layer).bindTooltip(tooltipContent, { sticky: true, direction: 'bottom', className: 'region-map-tooltip' });
      } else if (regionUserGroupId) {
        const regionGroup = regionUserGroups.find((rg) => rg.id === regionUserGroupId);
        if (regionGroup) {
          const tooltipContent = `<strong>${feature.properties.name}</strong><br/>${regionGroup.displayName}`;
          (layer as L.Layer).bindTooltip(tooltipContent, { sticky: true, direction: 'bottom', className: 'region-map-tooltip' });
        }
      }
    });
  }
}
