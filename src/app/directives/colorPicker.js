define([
  'angular',
  'app',
  'underscore',
  'chroma'
],
   function (angular, app, _, chroma) {
    'use strict';

    angular
      .module('kibana.directives')
      .directive('colorPicker', function () {
        return {
          templateUrl: 'app/partials/colorpicker.html',
          restrict: 'A',
          scope: {
            colors: '=colorPicker',
            palette: '=',
            defaultColors: '=',
            field: '=',
            data: '=',
            mode: '='
          },
          link: function ($scope) {

            function init() {
              // List of values with associated color
              if (!$scope.palette) {
                $scope.palette = [];
              }
              $scope.paletteValueFoundInData = true;
              $scope.mode = $scope.mode || 'list';
              $scope.brewer = chroma.brewer;
              $scope.nbOfClasses = ($scope.data && $scope.data.length) || 6;
            }


            $scope.addValue = function () {
              $scope.palette.push({
                label: 'value' + $scope.palette.length,
                color: '#FFFFFF'
              });
            };
            $scope.addValuesFromIndex = function () {
              angular.forEach($scope.data, function (item) {
                $scope.palette.push({label: item.label, color: '#FFFFFF'});
                item.color = '#FFFFFF';
              });
            };


            $scope.removeValue = function (index) {
              $scope.palette.splice(index, 1);
            };
            $scope.removeAllValues = function () {
              $scope.palette = [];
            };


            // Restore to default color palette
            // (define as directive attribute)
            $scope.setDefault = function () {
              $scope.colors = $scope.defaultColors;
            };

            function getColor(label) {
              var i, item;
              for (i = 0; i < $scope.palette.length; i ++) {
                item = $scope.palette[i];
                if (item.label === label) {
                  return item.color;
                }
              }
              return null;
            }


            // Add or delete color property to data items
            // based on the palette.
            $scope.updateDataColors = function () {
              $scope.colorsAsText = $scope.colors ? $scope.colors.join(',') : '';
              if ($scope.data) {
                var paletteValueFoundInData = false, i, item, color;
                for (i = 0; i < $scope.data.length; i ++) {
                  item = $scope.data[i];
                  color = getColor(item.label);
                  if (color === null) {
                    delete item.color;
                  } else {
                    item.color = color;
                    paletteValueFoundInData = true;
                  }
                }
                // Display a warning if the palette describes
                // values not in current dataset
                $scope.paletteValueFoundInData = paletteValueFoundInData;
              }
            };

            $scope.revert = function () {
              $scope.colors = $scope.colors.reverse();
            };

            // Create a map of label and colors based on
            // the selected palette.
            $scope.createPalette = function (b) {
              var scale = chroma.scale(b).out('hex'), i, item,
                nbOfValues = $scope.palette.length;
              for (i = 0; i < nbOfValues; i ++) {
                item = $scope.palette[i];
                item.color = scale(1 / nbOfValues * i);
              }
              $scope.updateDataColors();
            };

            // Create an array of colors from the selected palette.
            $scope.createPaletteList = function (b) {
              var colors = [], i,
                scale = chroma.scale(b).out('hex'),
                nbOfValues = $scope.nbOfClasses;
              for (i = 0; i < nbOfValues; i ++) {
                colors.push('"' + scale(1 / nbOfValues * i) + '"');
              }
              $scope.colors = colors;
              // Reset the label/color map as both can't be defined.
              $scope.palette = [];
            };


            $scope.parseColors = function () {
              if ($scope.colorsAsText) {
                var list = $scope.colorsAsText.split(','), colors = [];
                for (var i = 0; i < list.length; i ++) {
                  // TODO: Check valid color
                  colors.push(list[i]);
                }
                $scope.colors = colors;
                $scope.nbOfClasses = colors.length;
              }
            };

            $scope.$watchCollection('colorsAsText', $scope.parseColors);
            $scope.$watchCollection('palette', $scope.updateDataColors);
            $scope.$watch('palette.color', $scope.updateDataColors);


            init();
          }
        };
      });
  });
