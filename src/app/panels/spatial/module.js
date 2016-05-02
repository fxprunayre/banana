/*
 * Copyright 2014-2016 European Environment Agency
 *
 * Licensed under the EUPL, Version 1.1 or – as soon
 * they will be approved by the European Commission -
 * subsequent versions of the EUPL (the "Licence");
 * You may not use this work except in compliance
 * with the Licence.
 * You may obtain a copy of the Licence at:
 *
 * https://joinup.ec.europa.eu/community/eupl/og_page/eupl
 *
 * Unless required by applicable law or agreed to in
 * writing, software distributed under the Licence is
 * distributed on an "AS IS" basis,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND,
 * either express or implied.
 * See the Licence for the specific language governing
 * permissions and limitations under the Licence.
 */

/**
 * Map visualization panel
 */
define([
         'angular',
         'app',
         'underscore',
         'd3',
         'require',
         'css!./module.css',
         'css!./ol3/ol.css'
       ],
       function (angular, app, _, d3, localRequire) {
         'use strict';
         var DEBUG = false;
         var FEATURE_COLUMN_VALUE = '_value_';
         var module = angular.module('kibana.panels.spatial', ['ngeo']);
         app.useModule(module);

         module.service('heatmapService', function () {
           this.$get = ['$http', function ($http) {
             /**
              * Return Solr query heatmap parameters
              * based on current map extent and map zoom.
              *
              * @param {ol.map} map The OL map
              * @param {string} name  The heatmap name, default 'geom'
              * @param {int} gridlevel Force the gridlevel. It not
              *     defined, compute it based on the map zoom.
              *
              * @return {{
             *  [facet.heatmap]: (*|string),
             *  [facet.heatmap.geom]: string,
             *  [facet.heatmap.gridLevel]: (*|string)}}
              */
             function getHeatmapParams(map, name, gridlevel) {
               var extent = map.getView().calculateExtent(
                 map.getSize()
               );
               extent = ol.proj.transformExtent(
                 extent,
                 map.getView().getProjection(),
                 'EPSG:4326');

               var xmin = Math.max(extent[0], -180).toFixed(5),
                 xmax = Math.min(extent[2], 180).toFixed(5),
                 ymin = Math.max(extent[1], -90).toFixed(5),
                 ymax = Math.min(extent[3], 90).toFixed(5);

               // Compute grid level based on current zoom
               // Zoom goes from 1 to 28
               // GridLevel 1 to 11 but Solr may return exception
               // if too many cells are requested (depends on extent).
               // Restrict between 3 and 11
               var gridLevel = function (z) {
                 if (0 <= z && z <= 2) {
                   return 2;
                 }
                 if (2 < z && z <= 5) {
                   return 3;
                 }
                 if (5 < z && z <= 7) {
                   return 4;
                 }
                 if (7 < z && z <= 10) {
                   return 5;
                 }
                 if (10 < z && z <= 12) {
                   return 6;
                 }
                 if (12 < z && z <= 14) {
                   return 7;
                 }
                 if (14 < z && z <= 18) {
                   return 8;
                 }
                 if (18 < z && z <= 20) {
                   return 9;
                 }
                 if (20 < z && z <= 24) {
                   return 10;
                 }
                 if (24 < z) {
                   return 11;
                 }
                 // Depends on distErrPct in Solr geom field
                 // configuration TODO: Maybe compute another lower
                 // grid level when the following exception occur:
                 // Caused by: java.lang.IllegalArgumentException: Too
                 // many cells (361 x 434) for level 8 shape
                 // Rect(minX=3.49852,maxX=3.62211,minY=40.49707,maxY=40.57137)
               };
               var computedGridLevel = gridLevel(
                 map.getView().getZoom());
               //var computedGridLevel =
               //  (Math.min(11,
               //    Math.max(2,
               //      (map.getView().getZoom() / 2)
               //      // Better resolution but slow
               //      //(map.getView().getZoom() / 2) + 1
               //  ))).toFixed(0);
               //console.log('Zoom: ' + map.getView().getZoom() +
               //  ' Grid: ' + computedGridLevel);

               return {
                 'facet.heatmap': name || 'geom',
                 'facet.heatmap.geom': '["' +
                                       xmin + ' ' +
                                       ymin + '" TO "' +
                                       xmax + ' ' +
                                       ymax + '"]',
                 'facet.heatmap.gridLevel': gridlevel
                                            || computedGridLevel
               };
             };
             /**
              * Convert a Solr heatmap in an array of features.
              *
              * @param {object} heatmap The heatmap object from the
              *     Solr response
              * @param {string} proj  The map projection to create
              *     feature into.
              * @param {string} asGrid Use a grid instead of points
              * in cell center
              * @return {Array}
              */
             function heatmapToFeatures(heatmap, proj, asGrid) {
               var grid = {}, features = [];
               for (var i = 0; i < heatmap.length; i++) {
                 grid[heatmap[i]] = heatmap[i + 1];
                 i++;
               }
               if (grid) {
                 // The initial outer level is in row order
                 // (top-down),
                 // then the inner arrays are the columns
                 // (left-right).
                 // The entire value is null if there is no matching
                 // data.
                 var rows = grid.counts_ints2D,
                   cellwidth = (grid.maxX - grid.minX) / grid.columns,
                   cellheight = (grid.maxY - grid.minY) / grid.rows,
                   max = 0;
                 //console.log(grid.columns + " x " + grid.rows);
                 if (rows === null) {
                   console.warn('Empty heatmap returned.');
                   return [];
                 }

                 for (var i = 0; i < rows.length; i++) {
                   for (var j = 0;
                        rows[i] != null && j < rows[i].length; j++) {
                     max = Math.max(max, rows[i][j]);
                   }
                 }

                 for (var i = 0; i < rows.length; i++) {
                   // If any array would be all zeros, a null is
                   // returned instead for efficiency reasons.
                   if (!angular.isArray(rows[i])) {
                     continue;
                   }
                   for (var j = 0; j < rows[i].length; j++) {
                     if (rows[i][j] == 0) {
                       continue;
                     }
                     var geom;
                     // TODO: Start of experiment to display grid
                     if (asGrid) {
                       var pt = new ol.geom.Point([
                         grid.minX + cellwidth * j,
                         grid.maxY - cellheight * i]);
                       var ulc = pt.clone();
                       var coords = [ulc.getCoordinates()];
                       pt.translate(0, -cellheight);
                       coords.push(pt.getCoordinates());
                       pt.translate(cellwidth, 0);
                       coords.push(pt.getCoordinates());
                       pt.translate(0, cellheight);
                       coords.push(pt.getCoordinates());
                       coords.push(ulc.getCoordinates());
                       geom = new ol.geom.Polygon([coords]);
                     } else {
                       geom = new ol.geom.Point([
                         grid.minX + cellwidth * j + cellwidth / 2,
                         grid.maxY - cellheight * i - cellheight / 2]);
                     }
                     var value = rows[i][j];
                     var weight = (value / max).toFixed(4);
                     //var weight = 1 - (1 / (1 + value / (1 / max)));
                     var feature = new ol.Feature({
                       geometry: geom.transform(
                         'EPSG:4326',
                         proj),
                       count: value,
                       weight: weight
                     });
                     //console.log(value + " = " + weight);
                     features.push(feature);
                   }
                 }
               }
               return features;
             };
             return {
               getHeatmapParams: getHeatmapParams,
               heatmapToFeatures: heatmapToFeatures
             };
           }];
         });
         module.controller('spatial', function ($scope, $timeout,
                                                ngeoFeatureOverlayMgr,
                                                ngeoToolActivateMgr,
                                                ngeoDecorateInteraction,
                                                ngeoDebounce,
                                                querySrv, dashboard, filterSrv) {
           $scope.panelMeta = {
             modals: [
               {
                 description: "Inspect",
                 icon: "fa fa-info",
                 partial: "app/partials/inspector.html",
                 show: $scope.panel.spyable
               }
             ],
             editorTabs: [{
                 title: 'Configuration',
                 src: 'app/panels/spatial/configuration.html'
               }
             ],
             status: "Experimental",
             description: "Map visualization (filter, heatmap or thematic map)."
           };

           // Set and populate defaults
           $scope.mapModes = ['filter', 'heatmap', 'thematic', 'map'];

           $scope.backgroundLayers = [{
             key: 'None'
           }, {
             key: 'OSM',
             layer: new ol.layer.Tile({
               source: new ol.source.OSM()
             })
           }, {
             key: 'Sat',
             layer:  new ol.layer.Tile({
               source: new ol.source.MapQuest({layer: 'sat'})
             })
           }];

           // Classification layers
           $scope.thematicLayers = [{
             key: 'World - Countries',
             type: 'GEOJSON',
             url: 'app/panels/spatial/data/world.json'
           }, {
             key: 'Europe - Countries',
             type: 'GEOJSON',
             url: 'app/panels/spatial/data/europe.json'
           }, {
             key: 'France - Départements (simplifiés)',
             type: 'GEOJSON',
             url: 'app/panels/spatial/data/frdep1000.json'
           }, {
             key: 'France - Départements',
             type: 'GEOJSON',
             url: 'app/panels/spatial/data/frdep.json'
           }, {
               key: 'France - Régions',
               type: 'GEOJSON',
               url: 'app/panels/spatial/data/frreg2015.json'
           }];

           $scope.facetSorts = ['count desc', 'count asc', 'index desc', 'index asc'];
           $scope.filterModes = ['Intersects', 'Contains', 'IsWithin'];
           $scope.thematicRenderTypes = ['equalInterval'];
           // TODO: $scope.thematicRenderTypes = ['equalInterval', 'quantile',
           // 'naturalBreaks', 'standardDeviation', 'prettyBreaks'];
           var map, _d = {
             queries: {
               mode: 'all',
               ids: [],
               query: '*:*',
               custom: ''
             },
             size: 1000,
             spyable: true,
             backgroundColor: null,
             backgroundLayer: $scope.backgroundLayers[0].key,
             centerLat: 0,
             centerLon: 0,
             zoom: 2,
             mapMouseWheelZoom: true,
             mapZoom: true,
             mapMode: 'filter',
             filterField: null,
             filterActive: false,
             filterMode: $scope.filterModes[0],
             facetLimit: 300,
             facetMinCount: 1,
             facetSort: $scope.facetSorts[0],
             facetMissing: false,
             facetPrefix: '',
             heatmapField: null,
             thematicField: null,
             thematicLayer: $scope.thematicLayers[0].key,
             thematicLayerField: null,
             thematicLayerFieldExpression: null,
             thematicRenderType: $scope.thematicRenderTypes[0],
             // TODO: Legend format %1 - %2 ?
             show_queries: true,
             strokeColor: null,
             strokeWidth: 1,
             strokeOpacity: 1,
             colors : querySrv.colors,
             colorPalette: null
           };

           _.defaults($scope.panel, _d);
           $scope.requireContext = localRequire;
           $scope.defaultColors = querySrv.colors;
           $scope.legend = null;


           this.map = new ol.Map({
             view: new ol.View({
               center: [$scope.panel.centerLon, $scope.panel.centerLat],
               zoom: $scope.panel.zoom
             })
           });
           map = this.map;

           $scope.setLocationFromCurrentView = function() {
             $scope.panel.centerLon = map.getView().getCenter()[0];
             $scope.panel.centerLat = map.getView().getCenter()[1];
             $scope.panel.zoom = map.getView().getZoom();
           };

           $scope.setBackgroundLayer = function () {
             var bgLayer = null;
             map.getLayers().forEach(function (l) {
               map.removeLayer(l);
             });
             for (var i = 0; i < $scope.backgroundLayers.length; i ++) {
               var l = $scope.backgroundLayers[i];
               if (l.key === $scope.panel.backgroundLayer) {
                 bgLayer = l.layer;
                 break;
               }
             }
             if (bgLayer) {
               map.addLayer(bgLayer);
             }
           }


           function updateMap () {
             var that = map;
             // Enable or disable mouse wheel zoom
             map.getInteractions().forEach(function (i) {
               if (i instanceof ol.interaction.MouseWheelZoom) {
                 i.setActive($scope.panel.mapMouseWheelZoom);
               }
             });

             // Enable or disable zoom control
             if ($scope.panel.mapZoom === false) {
               map.getControls().forEach(function (i) {
                 if (i instanceof ol.control.Zoom) {
                   map.removeControl(i);
                 }
               });
             } else {
               map.addControl(new ol.control.Zoom());
             }

             $scope.setBackgroundLayer();
             if ($scope.panel.mapMode === 'filter') {
               $scope.initFilterMode();
             } else {
               map.removeInteraction($scope.filterInteraction);
             }

             if ($scope.panel.mapMode === 'thematic') {
               $scope.addThematicLayer();
             } else {
               map.removeLayer($scope.thematicLayer);
             }
             // TODO: turn off filter mode
           }


           $scope.close_edit = function () {
             if ($scope.refresh) {
             }
             updateMap();
             $scope.$emit('render');
             $scope.refresh = false;
           };


           // Draw a rectangle on the map and enable a spatial
           // filter on dashboard results.
           var filterId = undefined;
           var feature = new ol.Feature();
           var featureOverlay = new ol.layer.Vector({
             source: new ol.source.Vector(),
             map: map
           });
           featureOverlay.getSource().addFeature(feature);

           $scope.initFilterMode = function () {
             // initialize the feature overlay manager with the map
             ngeoFeatureOverlayMgr.init(map);

             function setFilter(geom) {
               if (angular.isDefined(geom)) {
                 feature.setGeometry(geom);
                 var lonlatFeat, writer, wkt;
                 lonlatFeat = feature.clone();
                 lonlatFeat.getGeometry().transform(
                   map.getView().getProjection().getCode(),
                   'EPSG:4326');
                 writer = new ol.format.WKT();
                 wkt = writer.writeFeature(lonlatFeat);

                 filterId = filterSrv.set({
                   type: 'querystring',
                   query: $scope.panel.filterField +
                          ':"' + $scope.panel.filterMode +
                          '(' + wkt + ')"'
                 }, filterId);
               } else {
                  feature.setGeometry(null);
                  filterSrv.remove(filterId);
                  filterId = undefined;
               }
               dashboard.refresh();
             }

             $scope.filterInteraction = new ol.interaction.DragBox();
             $scope.filterInteraction.setActive($scope.panel.filterActive);
             ngeoDecorateInteraction($scope.filterInteraction);
             map.addInteraction($scope.filterInteraction);

             // var interaction = this.interaction;
             $scope.filterInteraction.on('boxend', function() {
               $scope.$apply(function() {
                 setFilter($scope.filterInteraction.getGeometry());
               });
             });

             $scope.drawRegionTool = new ngeo.ToolActivate(
               $scope.filterInteraction, 'inactive');
             ngeoToolActivateMgr.registerTool('mapTools', $scope.drawRegionTool);

             $scope.$watch('filterInteraction.active', function(v, o) {
               if (!v && o) {
                 setFilter();
               }
             });
           }


           // Load JSON layer
           var listenerKey;
           $scope.loadThematicLayerSource = function (url) {
             ol.Observable.unByKey(listenerKey);

             $scope.thematicLayerSource = new ol.source.Vector({
               projection : 'EPSG:4326',
               url: url,
               format: new ol.format.GeoJSON()
             });
             $scope.thematicLayerFields = [];

             listenerKey = $scope.thematicLayerSource.on('change', function(e) {
               if ($scope.thematicLayerSource.getState() == 'ready') {
                 console.log($scope.thematicLayerSource.getFeatures().length);
                 var feature = $scope.thematicLayerSource.getFeatures()[0];
                 if (feature) {
                   $scope.thematicLayerFields.push('');
                   angular.forEach(feature.getProperties(), function (v, k) {
                     $scope.thematicLayerFields.push(k);
                   });

                   // Load facets
                   $scope.getData();
                 } else {
                   console.warn('Feature does not have any attributes');
                 }
                 ol.Observable.unByKey(listenerKey);
               }
             });
             return $scope.thematicLayerSource;
           };


           // Compute legend based on datasets
           function computeLegend() {
             $scope.min = d3.min($scope.domain);
             $scope.max = d3.max($scope.domain);
             $scope.interval = ($scope.max - $scope.min) / $scope.panel.colors.length;

             // https://github.com/mbostock/d3/wiki/Quantitative-Scales
             // $scope.scale = d3.scale.quantile()
             $scope.scale = d3.scale.quantize()
               .domain($scope.domain)
               .range($scope.panel.colors);
             // var quantiles = $scope.scale.quantiles();

             // console.log('[' + $scope.min + ' ' + $scope.max + '] interval: ' + $scope.interval + ' classes: ' + $scope.panel.colors.length);
             $scope.legend = [];
             for (var i = 0; i < $scope.panel.colors.length; i++) {
               var classeMin = i * $scope.interval + $scope.min,
                 classeMax = classeMin + $scope.interval;
               // If facet return no data, no style.
               if ($scope.domain.length > 0) {
                 $scope.legend.push({
                    id: i,
                    color: $scope.scale(classeMin + 1).replace(/"/g, ''),
                    label: classeMin.toFixed(0) + ' - ' + classeMax.toFixed(0),
                    match: []
                  });
               }
             }
           };




           $scope.addThematicLayer = function () {
             var url = null;
             $scope.legend = null;
             for (var i = 0; i < $scope.thematicLayers.length; i ++) {
               var l = $scope.thematicLayers[i];
               if (l.key === $scope.panel.thematicLayer) {
                 url = l.url;
                 break;
               }
             }
             var thematicMapStyleFn = function (feature, resolution) {
               var stroke = null, defaultRenderingStyle;
               if ($scope.panel.strokeColor &&
                   $scope.panel.strokeColor !== '') {
                 var c = ol.color.asArray($scope.panel.strokeColor);
                 if ($scope.panel.strokeOpacity) {
                   c[3] = $scope.panel.strokeOpacity;
                 }
                 stroke = new ol.style.Stroke({
                     color: c,
                     width: $scope.panel.strokeWidth
                   });
                 defaultRenderingStyle = new ol.style.Style({
                   stroke: stroke,
                   fill: new ol.style.Fill({
                     color: '#FFF'
                   })
                 });
               }

               var value = feature.getProperties()[FEATURE_COLUMN_VALUE];
               if (value) {
                 var color = $scope.scale(value);
                 if (color) {
                   color = color.replace(/"/g, '');
                 } else {
                   color = '#000';
                 }
                 return new ol.style.Style({
                   stroke: stroke,
                   fill: new ol.style.Fill({
                     color: color
                   })
                 });
               } else {
                 // Default rendering style configured or null if none.
                 return defaultRenderingStyle || null;
               }
             };
             if (url != null) {
               // TODO: A proxy may be required
               $scope.thematicLayer = new ol.layer.Vector({
                 source: $scope.loadThematicLayerSource(url),
                 style: thematicMapStyleFn
               });
               map.addLayer($scope.thematicLayer);
             } else {
               console.warn('Thematic layer URL can\'t be null');
             }



            // TODO: Handle multiple maps
             $('body').append('<div id="heatmap-info" data-content=""' +
                              'style="position: absolute; z-index: 100;"/>');
             var info = $('#heatmap-info');

             info.popover();

             var displayFeatureInfo = function(pixel) {
               var feature = map.forEachFeatureAtPixel(pixel, function(feature) {
                 return feature;
               });
               if (feature) {
                 var value = feature.getProperties()[FEATURE_COLUMN_VALUE];
                 if (value) {
                   var mapPos = map.getTarget().getBoundingClientRect();
                   info.css({
                              left: (pixel[0] + mapPos.left) + 'px',
                              top: (pixel[1] + mapPos.top) + 'px'
                            });

                   console.log(feature.getProperties()[$scope.panel.thematicLayerField])
                   info.attr('data-original-title', value)
                       .popover('show');
                 } else {
                   info.attr('data-original-title', '');
                   info.popover('hide');
                 }
               } else {
                 info.popover('hide');
               }
             };

             map.on('pointermove', ngeoDebounce(function(evt) {
               if (evt.dragging) {
                 info.popover('hide');
                 return;
               }
               displayFeatureInfo(map.getEventPixel(evt.originalEvent));
             }), 500);

           }



           // Return the facet key, optionnally applying
           // the key expression defined in order to transform
           // the facet value to a something else.
           // eg. if facet key is 'dpt43' and key expression
           // is dpt(.*), 43 is returned.
           // If no match return the value.
           var getFacetKey = function (val) {
             if ($scope.panel.thematicLayerFieldExpression) {
                var tokens = val.match(
                  new RegExp($scope.panel.thematicLayerFieldExpression));
               if (tokens.length > 0) {
                 return tokens[1];
               }
             }
             return val;
           };


           // Use facet API to retrieve statistics
           $scope.getData = function () {
             var request = $scope.sjs.Request().indices(dashboard.indices);
             var wt_json = '&wt=json';
             var rows_limit = '&rows=0';
             var facet = '&json.facet=';
             var facetConfig = {
               buckets: {
                 type: 'terms',
                 field: $scope.panel.thematicField,
                 limit: $scope.panel.facetLimit,
                 mincount: $scope.panel.facetMinCount,
                 prefix: $scope.panel.facetPrefix,
                 sort: $scope.panel.facetSort, // TODO: Applies to legend
                 missing: $scope.panel.missing
               }
             };
             facet += angular.toJson(facetConfig);
             var fq = '';
             if (filterSrv.getSolrFq() && filterSrv.getSolrFq() != '') {
               fq = '&' + filterSrv.getSolrFq();
             }
             var query = querySrv.getORquery() + wt_json + fq + rows_limit + facet;
             if ($scope.panel.queries.custom != null) {
               query += $scope.panel.queries.custom;
             }
             request = request.setQuery(query);

             var results = request.doSearch();
             var that = map;
             results.then(function(results) {
               var data = results.facets && results.facets.buckets.buckets;
               if (data) {
                 // From facets, create a map of key value
                 var valueMap = {};
                 $scope.domain = [];
                 for (var i = 0; i < data.length; i ++) {
                   var value = data[i].count;
                   var key = getFacetKey(data[i].val);
                   //thematicLayerFieldExpression
                   valueMap[key] = value;
                   $scope.domain.push(value);
                 }

                 computeLegend();

                 // Populate value attribute of each features
                 var features = $scope.thematicLayerSource.getFeatures();
                 for (var i = 0; i < features.length; i ++) {
                   var props = features[i].getProperties(),
                       fKey = props[$scope.panel.thematicLayerField];
                   if (valueMap[fKey]) {
                    features[i].set(FEATURE_COLUMN_VALUE, valueMap[fKey]);
                   } else {
                     features[i].set(FEATURE_COLUMN_VALUE, null);
                   }
                 }
               }
               that.render();
               // $scope.thematicLayer.redraw();
             });
           }

           updateMap();

           $scope.$emit('render');

           $scope.$on('refresh', function() {
             $scope.getData();
           });
         });

         module.directive('spatial', function ($timeout) {
           return {
             restrict: 'A',
             link: function (scope, elem, attrs) {
               scope.loading = true;
               scope.map = scope.$eval(attrs['spatial']);

               // This is a hack to wait Angular to render element.
               $timeout(function () {
                 scope.map.updateSize();
                 scope.loading = false;
               }, 200);
             }
           };
         });

       });
