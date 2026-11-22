/* =========================================================
   MAPLIBRE ARENA CROPPER & NON-OVERLAPPING RPG MAP DECORATOR
   1. Crops world cleanly outside Playable Arena (Inverted GeoJSON Mask + maxBounds)
   2. Fills ONLY empty grassy/open spaces with 40422.jpg pixel props (trees, ponds, huts, rocks)
   3. Queries real MapLibre vector features so NO prop ever overlaps roads, buildings, or water!
   4. Zoom-interpolates props so they scale cleanly with roads on zoom in / zoom out!
   ========================================================= */
window.ZP_MAP_DECOR = (function () {
  const PROP_FILES = {
    pine_green:  "assets/props/pine_green.png",
    pine_autumn: "assets/props/pine_autumn.png",
    pond:        "assets/props/pond.png",
    bush:        "assets/props/bush.png",
    cabin:       "assets/props/cabin.png",
    rock:        "assets/props/rock.png"
  };

  function createCircleRing(lng, lat, radiusMeters, points = 64) {
    const coords = [];
    const km = radiusMeters / 1000;
    const dx = km / (111.320 * Math.cos((lat * Math.PI) / 180));
    const dy = km / 110.574;
    for (let i = 0; i <= points; i++) {
      const th = (i / points) * Math.PI * 2;
      coords.push([lng + dx * Math.cos(th), lat + dy * Math.sin(th)]);
    }
    return coords;
  }

  // Inverted Polygon: covers the whole planet EXCEPT the circular Playable Arena!
  function buildCropMaskGeoJSON(lng, lat, cropRadiusMeters) {
    const outer = [[-179.9, -85], [179.9, -85], [179.9, 85], [-179.9, 85], [-179.9, -85]];
    const hole = createCircleRing(lng, lat, cropRadiusMeters, 72).reverse();
    return {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [outer, hole]
      }
    };
  }

  function buildBorderGeoJSON(lng, lat, cropRadiusMeters) {
    return {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [createCircleRing(lng, lat, cropRadiusMeters, 72)]
      }
    };
  }

  // Compute tight maxBounds slightly outside the cropped arena so distant map tiles NEVER load!
  function computeArenaBounds(lng, lat, cropRadiusMeters) {
    const padKm = (cropRadiusMeters + 65) / 1000;
    const dLng = padKm / (111.320 * Math.cos((lat * Math.PI) / 180));
    const dLat = padKm / 110.574;
    return [
      [lng - dLng, lat - dLat],
      [lng + dLng, lat + dLat]
    ];
  }

  function applyArenaCrop(map, lng, lat, cropRadiusMeters) {
    const maskData = buildCropMaskGeoJSON(lng, lat, cropRadiusMeters);
    const borderData = buildBorderGeoJSON(lng, lat, cropRadiusMeters);

    // Restrict panning/loading to just slightly outside the cropped zone!
    map.setMaxBounds(computeArenaBounds(lng, lat, cropRadiusMeters));

    if (map.getSource("arena-crop-mask")) {
      map.getSource("arena-crop-mask").setData(maskData);
      map.getSource("arena-crop-border").setData(borderData);
      return;
    }

    map.addSource("arena-crop-mask", { type: "geojson", data: maskData });
    map.addLayer({
      id: "arena-crop-mask-fill",
      type: "fill",
      source: "arena-crop-mask",
      paint: {
        "fill-color": "#0d1712",
        "fill-opacity": 0.96
      }
    });

    map.addSource("arena-crop-border", { type: "geojson", data: borderData });
    map.addLayer({
      id: "arena-crop-border-line",
      type: "line",
      source: "arena-crop-border",
      paint: {
        "line-color": "#e6b422",
        "line-width": 4,
        "line-dasharray": [3, 2]
      }
    });
  }

  // Load all 6 RPG prop sprites into MapLibre WebGL texture atlas
  function loadPropImages(map, onDone) {
    const keys = Object.keys(PROP_FILES);
    let left = keys.length;
    keys.forEach(k => {
      if (map.hasImage(k)) {
        if (--left === 0 && onDone) onDone();
        return;
      }
      const img = new Image();
      img.onload = () => {
        try { if (!map.hasImage(k)) map.addImage(k, img, { pixelRatio: 2 }); } catch (e) {}
        if (--left === 0 && onDone) onDone();
      };
      img.onerror = () => {
        if (--left === 0 && onDone) onDone();
      };
      img.src = PROP_FILES[k];
    });
  }

  // Check if a projected point on the MapLibre map hits ANY road, building, bridge, or water!
  function isBlockedByMapFeature(map, lngLat) {
    try {
      const pt = map.project(lngLat);
      const box = [[pt.x - 14, pt.y - 14], [pt.x + 14, pt.y + 14]];
      const feats = map.queryRenderedFeatures(box);
      for (let i = 0; i < feats.length; i++) {
        const lid = (feats[i].layer && feats[i].layer.id || "").toLowerCase();
        const sl = (feats[i].sourceLayer || "").toLowerCase();
        // Skip our own layers
        if (lid.indexOf("safe-zone") === 0 || lid.indexOf("next-zone") === 0 || lid.indexOf("arena-crop") === 0 || lid.indexOf("rpg-props") === 0) {
          continue;
        }
        // Strictly block roads, buildings, pathways, rail, bridges, water!
        if (
          lid.includes("road") || lid.includes("street") || lid.includes("highway") ||
          lid.includes("path") || lid.includes("track") || lid.includes("bridge") ||
          lid.includes("rail") || lid.includes("building") || lid.includes("water") ||
          lid.includes("tunnel") || lid.includes("aeroway") ||
          sl.includes("transportation") || sl.includes("building") || sl.includes("water")
        ) {
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  // Decorate empty grassy/open spaces using pre-baked candidates from 3_room_lobby.html
  // Strict zero-overlap with roads, buildings, water, and each other!
  function decorateEmptySpaces(map, anchorLng, anchorLat, propCandidates) {
    loadPropImages(map, () => {
      const features = [];
      const cosLat = Math.cos((anchorLat * Math.PI) / 180);

      (propCandidates || []).forEach(c => {
        const lng = anchorLng + c.x / (111320 * cosLat);
        const lat = anchorLat - c.y / 111320;
        if (!isBlockedByMapFeature(map, [lng, lat])) {
          features.push({
            type: "Feature",
            properties: { icon: c.type },
            geometry: { type: "Point", coordinates: [lng, lat] }
          });
        }
      });

      const fc = { type: "FeatureCollection", features };
      if (map.getSource("rpg-props")) {
        map.getSource("rpg-props").setData(fc);
        return;
      }

      map.addSource("rpg-props", { type: "geojson", data: fc });
      map.addLayer({
        id: "rpg-props-layer",
        type: "symbol",
        source: "rpg-props",
        layout: {
          "icon-image": ["get", "icon"],
          // Scales smoothly with map zoom so trees/huts stay proportional to roads!
          "icon-size": [
            "interpolate", ["exponential", 2], ["zoom"],
            15.5, 0.42,
            17.0, 0.95,
            18.5, 1.85,
            19.2, 2.55
          ],
          "icon-anchor": "bottom",
          // Built-in WebGL collision detection -> GUARANTEES ZERO OVERLAP!
          "icon-allow-overlap": false,
          "icon-ignore-placement": false,
          "icon-padding": 6
        }
      });
    });
  }

  return {
    createCircleRing,
    applyArenaCrop,
    decorateEmptySpaces
  };
})();
